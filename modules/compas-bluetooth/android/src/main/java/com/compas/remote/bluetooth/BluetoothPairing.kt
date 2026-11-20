package com.compas.remote.bluetooth

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import expo.modules.kotlin.Promise
import java.io.IOException
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap

internal const val PAIRING_REQUIRED_MESSAGE = "Select a paired Bluetooth player first."
internal class PairingRequiredException : IOException(PAIRING_REQUIRED_MESSAGE)

internal fun normalizeDeviceId(deviceId: String): String = deviceId.uppercase(Locale.ROOT)

internal class BluetoothPairing(
    private val context: () -> Context,
    private val bluetoothAdapter: () -> BluetoothAdapter?,
    private val isDestroyed: () -> Boolean,
    private val rejectRequests: (String, String, String) -> Unit,
) {
    private val pendingPairing = ConcurrentHashMap.newKeySet<String>()
    val lock = Any()
    private val pairingBlockedDeviceIds = ConcurrentHashMap.newKeySet<String>()
    private val rfcommDeviceIds = ConcurrentHashMap.newKeySet<String>()
    private var pairingReceiver: BroadcastReceiver? = null
    private var pairingReceiverContext: Context? = null

    fun pairDevice(deviceId: String, promise: Promise) {
        try {
            val adapter = bluetoothAdapter() ?: throw IllegalStateException("Bluetooth unavailable")
            val device = adapter.getRemoteDevice(deviceId)
            if (device.bondState == BluetoothDevice.BOND_BONDED) {
                promise.resolve(true)
                return
            }
            if (adapter.isDiscovering) adapter.cancelDiscovery()
            pendingPairing.add(deviceId)
            val accepted = device.createBond()
            promise.resolve(accepted)
        } catch (e: Exception) {
            pendingPairing.remove(deviceId)
            promise.reject("PAIR_FAILED", e.message, e)
        }
    }

    fun resetPairingBlock(deviceId: String, promise: Promise) {
        val normalizedId = normalizeDeviceId(deviceId)
        synchronized(lock) {
            if (normalizedId in pairingBlockedDeviceIds) {
                rejectRequests(normalizedId, "RFCOMM_CANCELLED", "Bluetooth request was cancelled")
                pairingBlockedDeviceIds.remove(normalizedId)
            }
        }
        promise.resolve(true)
    }

    fun noteRfcommDevice(id: String) {
        rfcommDeviceIds.add(id)
    }

    fun clearPendingPairing(id: String) {
        pendingPairing.remove(id)
    }

    fun requireBondedLocked(adapter: BluetoothAdapter, device: BluetoothDevice, id: String) {
        if (id in pairingBlockedDeviceIds) throw PairingRequiredException()
        if (!adapter.isEnabled) throw IOException("Bluetooth adapter is disabled")
        if (device.bondState != BluetoothDevice.BOND_BONDED) {
            pairingBlockedDeviceIds.add(id)
            rejectRequests(id, "BLUETOOTH_PAIRING_REQUIRED", PAIRING_REQUIRED_MESSAGE)
            throw PairingRequiredException()
        }
    }

    fun destroy(markDestroyed: () -> Unit) {
        synchronized(lock) {
            markDestroyed()
            pairingReceiver?.let { receiver ->
                runCatching { pairingReceiverContext?.unregisterReceiver(receiver) }
                pairingReceiver = null
                pairingReceiverContext = null
            }
        }
    }

    fun ensureReceiverRegistered() {
        synchronized(lock) {
            if (isDestroyed() || pairingReceiver != null) return
            val receiver = object : BroadcastReceiver() {
                override fun onReceive(context: Context, intent: Intent) {
                    @Suppress("DEPRECATION")
                    val device = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE) as? BluetoothDevice ?: return
                    val id = normalizeDeviceId(device.address)
                    // A pairing broadcast can arrive after the socket already failed, between requests.
                    if (id !in rfcommDeviceIds || bluetoothAdapter()?.isEnabled != true) return
                    when (intent.action) {
                        BluetoothDevice.ACTION_PAIRING_REQUEST -> {
                            // Observe the system pairing UI without changing or cancelling its flow.
                            blockDeviceForPairing(id)
                        }
                        BluetoothDevice.ACTION_BOND_STATE_CHANGED -> {
                            val state = intent.getIntExtra(BluetoothDevice.EXTRA_BOND_STATE, BluetoothDevice.ERROR)
                            if (state == BluetoothDevice.BOND_NONE || state == BluetoothDevice.BOND_BONDING) {
                                blockDeviceForPairing(id)
                            }
                        }
                    }
                }
            }
            val filter = IntentFilter().apply {
                addAction(BluetoothDevice.ACTION_PAIRING_REQUEST)
                addAction(BluetoothDevice.ACTION_BOND_STATE_CHANGED)
            }
            val receiverContext = context().applicationContext
            if (Build.VERSION.SDK_INT >= 33) {
                receiverContext.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED)
            } else {
                receiverContext.registerReceiver(receiver, filter)
            }
            pairingReceiver = receiver
            pairingReceiverContext = receiverContext
        }
    }

    private fun blockDeviceForPairing(deviceId: String) {
        synchronized(lock) {
            pairingBlockedDeviceIds.add(deviceId)
            rejectRequests(deviceId, "BLUETOOTH_PAIRING_REQUIRED", PAIRING_REQUIRED_MESSAGE)
        }
    }
}
