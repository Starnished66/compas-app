package com.compas.remote.bluetooth

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import android.os.SystemClock
import android.util.Log
import expo.modules.kotlin.Promise

internal class BluetoothDiscovery(
    private val context: () -> Context,
    private val bluetoothAdapter: () -> BluetoothAdapter?,
    private val adapterFor: (Context) -> BluetoothAdapter?,
    private val isDestroyed: () -> Boolean,
    private val clearPendingPairing: (String) -> Unit,
    private val sendEvent: (String, Map<String, Any?>) -> Unit,
) {
    private var discoveryReceiver: BroadcastReceiver? = null
    private val mainHandler = Handler(Looper.getMainLooper())
    private var discoveryTimeout: Runnable? = null
    private var inquiryCheck: Runnable? = null
    private val inquiry = BluetoothInquiry()
    private var inquiryReceiverContext: Context? = null
    private val inquiryReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (!discoveryTurn.owns(inquiry) || !inquiry.awaitingFinish ||
                (isDestroyed() && !inquiry.waitingAfterDestroy)) return
            val adapter = runCatching { adapterFor(context) }.getOrNull() ?: return
            val isDiscovering = runCatching { adapter.isDiscovering }.getOrNull() ?: return
            when (intent.action) {
                BluetoothAdapter.ACTION_DISCOVERY_STARTED -> inquiry.discoveryStarted(isDiscovering) {
                    cancelAdapterDiscovery(adapter)
                }
                BluetoothAdapter.ACTION_DISCOVERY_FINISHED -> inquiry.finished(isDiscovering)
            }
            releaseIdleInquiry()
        }
    }

    fun destroyOnMain() {
        val cleanupDiscovery = Runnable { destroyDiscovery() }
        if (Looper.myLooper() == Looper.getMainLooper()) cleanupDiscovery.run()
        else mainHandler.post(cleanupDiscovery)
    }

    private fun destroyDiscovery() {
        discoveryTurn.cancelWait(inquiry)
        clearDiscoveryReceiver()
        val receiverContext = inquiryReceiverContext
        val timeout = Runnable { inquiry.destroyTimedOut() }
        inquiry.destroy(
            cancelIfActive = {
                runCatching {
                    val adapter = receiverContext?.let(adapterFor)
                    if (adapter != null) cancelInquiry(adapter, adapter.isDiscovering)
                }
            },
            release = {
                mainHandler.removeCallbacks(timeout)
                clearInquiryCheck()
                runCatching { receiverContext?.unregisterReceiver(inquiryReceiver) }
                inquiryReceiverContext = null
                discoveryTurn.release(inquiry)
            }
        )
        // A cancellation request can return before the adapter finishes the inquiry.
        if (inquiry.waitingAfterDestroy) mainHandler.postDelayed(timeout, INQUIRY_WATCH_TIMEOUT_MS)
    }

    fun requestDiscovery(scanId: Double, promise: Promise) {
        if (isDestroyed()) {
            promise.reject("BLUETOOTH_UNAVAILABLE", "Bluetooth is not available", null)
            return
        }
        discoveryTurn.request(inquiry,
            start = { startRequestedDiscovery(scanId, promise) },
            cancel = { promise.resolve(false) }
        )
    }

    private fun startRequestedDiscovery(scanId: Double, promise: Promise) {
        try {
            val adapter = if (isDestroyed()) null else bluetoothAdapter()
            if (adapter == null) {
                promise.reject("BLUETOOTH_UNAVAILABLE", "Bluetooth is not available", null)
                return
            }
            stopDiscoveryInternal(adapter)
            ensureInquiryReceiver()
            inquiry.recoverIfIdle(adapter.isDiscovering)
            if (!inquiry.awaitingFinish) {
                beginDiscovery(adapter, scanId, promise)
                return
            }
            val timeout = Runnable { inquiry.replacementTimedOut() }
            inquiry.queueReplacement(
                start = {
                    mainHandler.removeCallbacks(timeout)
                    beginDiscovery(adapter, scanId, promise)
                },
                cancel = {
                    mainHandler.removeCallbacks(timeout)
                    promise.resolve(false)
                }
            )
            watchInquiry(adapter)
            // An accepted inquiry in recovery keeps its original timeout.
            if (!inquiry.tracksAdapterState) mainHandler.postDelayed(timeout, 5_000L)
        } catch (e: Exception) {
            promise.reject("DISCOVERY_FAILED", e.message, e)
        } finally {
            releaseIdleInquiry()
        }
    }

    private fun releaseIdleInquiry() {
        if (inquiry.awaitingFinish || inquiry.waitingAfterDestroy) return
        clearInquiryCheck()
        discoveryTurn.release(inquiry)
    }

    private fun beginDiscovery(adapter: BluetoothAdapter, scanId: Double, promise: Promise) {
        if (isDestroyed()) {
            promise.resolve(false)
            return
        }
        try {
            val receiver = DiscoveryReceiver(scanId)
            val filter = IntentFilter().apply {
                addAction(BluetoothDevice.ACTION_FOUND)
                addAction(BluetoothDevice.ACTION_NAME_CHANGED)
                addAction(BluetoothDevice.ACTION_UUID)
                addAction(BluetoothDevice.ACTION_BOND_STATE_CHANGED)
            }
            registerDiscoveryReceiver(receiver, filter, requireNotNull(inquiryReceiverContext))
            discoveryReceiver = receiver
            adapter.bondedDevices.orEmpty().forEach { receiver.addBondedDevice(it) }
            val started = adapter.startDiscovery()
            if (started) {
                inquiry.started(receiver::finishInquiry)
                clearInquiryCheck()
                watchInquiry(adapter)
            } else {
                clearDiscoveryReceiver()
            }
            promise.resolve(started)
        } catch (e: Exception) {
            clearDiscoveryReceiver()
            promise.reject("DISCOVERY_FAILED", e.message, e)
        }
    }

    private fun watchInquiry(adapter: BluetoothAdapter) {
        if (inquiryCheck != null || !inquiry.needsAdapterCheck) return
        val startedAt = SystemClock.elapsedRealtime()
        val check = object : Runnable {
            override fun run() {
                if (inquiryCheck !== this) return
                inquiryCheck = null
                if (!inquiry.needsAdapterCheck) return
                val isDiscovering = runCatching { adapter.isDiscovering }.getOrNull()
                val elapsedMs = SystemClock.elapsedRealtime() - startedAt
                inquiry.checkAdapter(isDiscovering, elapsedMs) {
                    cancelAdapterDiscovery(adapter)
                }
                releaseIdleInquiry()
                if (inquiryCheck == null && inquiry.needsAdapterCheck && elapsedMs < INQUIRY_WATCH_TIMEOUT_MS) {
                    inquiryCheck = this
                    mainHandler.postDelayed(this, 250L)
                }
            }
        }
        inquiryCheck = check
        mainHandler.post(check)
    }

    private inner class DiscoveryReceiver(private val scanId: Double) : BroadcastReceiver() {
        private val candidates = LinkedHashMap<String, Pair<BluetoothDevice, String>>()
        private val awaitingSdp = LinkedHashSet<String>()
        private val verifiedIds = LinkedHashSet<String>()
        private val sdpRequestedIds = LinkedHashSet<String>()
        private val inquirySeenIds = LinkedHashSet<String>()
        private var inquiryComplete = false
        private var completed = false

        private fun shortId(id: String) = id.takeLast(5)

        private fun hasCachedRemoteService(device: BluetoothDevice): Boolean = runCatching {
            @Suppress("DEPRECATION")
            device.uuids.orEmpty().any { it.uuid == COMPAS_REMOTE_UUID }
        }.getOrDefault(false)

        private fun displayName(name: String?, address: String): String? =
            name?.trim()?.takeIf { it.isNotEmpty() && !it.equals(address, ignoreCase = true) }

        fun addBondedDevice(device: BluetoothDevice) {
            addCandidate(device, runCatching { device.name }.getOrNull())
        }

        private fun addCandidate(device: BluetoothDevice, rawName: String?, seenInInquiry: Boolean = false) {
            val name = displayName(rawName, device.address) ?: return
            if (completed) return
            candidates[device.address] = device to name
            if (seenInInquiry) inquirySeenIds.add(device.address)
            if (inquiryComplete) {
                requestSdp(device)
                finishIfReady()
            }
        }

        private fun requestSdp(device: BluetoothDevice) {
            val id = device.address
            if (id in verifiedIds || id in sdpRequestedIds || id in awaitingSdp || completed) return
            sdpRequestedIds.add(id)
            awaitingSdp.add(id)
            Log.i("CompasBluetooth", "SDP request queued id=${shortId(id)}")
            val started = runCatching { device.fetchUuidsWithSdp() }.getOrDefault(false)
            if (!started) {
                awaitingSdp.remove(id)
                Log.w("CompasBluetooth", "SDP request rejected id=${shortId(id)}")
            }
        }

        private fun finishIfReady() {
            if (inquiryComplete && awaitingSdp.isEmpty()) finish()
        }

        private fun finish() {
            if (completed || discoveryReceiver !== this) return
            completed = true
            discoveryTimeout?.let { mainHandler.removeCallbacks(it) }
            discoveryTimeout = null
            sendEvent("onDiscoveryFinished", mapOf("scanId" to scanId))
        }

        fun finishInquiry() {
            inquiryComplete = true
            val orderedCandidates = candidates.entries.sortedWith(
                compareByDescending<Map.Entry<String, Pair<BluetoothDevice, String>>> { it.key in inquirySeenIds }
                    .thenByDescending { hasCachedRemoteService(it.value.first) }
            )
            Log.i("CompasBluetooth", "Discovery inquiry complete; SDP candidates=${orderedCandidates.size}")
            orderedCandidates.forEach { (id, candidate) ->
                Log.i(
                    "CompasBluetooth",
                    "SDP priority id=${shortId(id)} inquirySeen=${id in inquirySeenIds} cachedRemoteService=${hasCachedRemoteService(candidate.first)}"
                )
                requestSdp(candidate.first)
            }
            if (awaitingSdp.isEmpty()) {
                finish()
            } else {
                val timeout = Runnable {
                    Log.w("CompasBluetooth", "Discovery SDP timeout pending=${awaitingSdp.size}")
                    finish()
                }
                discoveryTimeout = timeout
                mainHandler.postDelayed(timeout, 25_000L)
            }
        }

        override fun onReceive(context: Context, intent: Intent) {
            if (discoveryReceiver !== this) return
            when (intent.action) {
                BluetoothDevice.ACTION_FOUND, BluetoothDevice.ACTION_NAME_CHANGED -> {
                    @Suppress("DEPRECATION")
                    val device = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE) as? BluetoothDevice ?: return
                    addCandidate(device, intent.getStringExtra(BluetoothDevice.EXTRA_NAME)
                        ?: runCatching { device.name }.getOrNull(), seenInInquiry = intent.action == BluetoothDevice.ACTION_FOUND)
                }
                BluetoothDevice.ACTION_UUID -> {
                    @Suppress("DEPRECATION")
                    val device = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE) as? BluetoothDevice ?: return
                    val id = device.address
                    if (!awaitingSdp.remove(id) || completed) return
                    @Suppress("DEPRECATION")
                    val uuids = intent.getParcelableArrayExtra(BluetoothDevice.EXTRA_UUID)
                        ?.filterIsInstance<ParcelUuid>().orEmpty()
                    val hasRemoteService = uuids.any { it.uuid == COMPAS_REMOTE_UUID }
                    Log.i("CompasBluetooth", "SDP result id=${shortId(id)} uuidCount=${uuids.size} remoteService=$hasRemoteService")
                    if (hasRemoteService) {
                        val name = candidates[id]?.second
                        if (name != null) {
                            verifiedIds.add(id)
                            sendEvent("onDeviceFound", mapOf(
                                "scanId" to scanId,
                                "id" to id,
                                "name" to name,
                                "paired" to (device.bondState == BluetoothDevice.BOND_BONDED),
                                "verified" to true
                            ))
                        }
                    }
                    finishIfReady()
                }
                BluetoothDevice.ACTION_BOND_STATE_CHANGED -> {
                    @Suppress("DEPRECATION")
                    val device = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE) as? BluetoothDevice ?: return
                    if (device.address !in verifiedIds) return
                    val state = intent.getIntExtra(BluetoothDevice.EXTRA_BOND_STATE, BluetoothDevice.ERROR)
                    val prev = intent.getIntExtra(BluetoothDevice.EXTRA_PREVIOUS_BOND_STATE, BluetoothDevice.ERROR)
                    val name = candidates[device.address]?.second ?: return
                    if (state == BluetoothDevice.BOND_BONDED || state == BluetoothDevice.BOND_NONE) {
                        clearPendingPairing(device.address)
                    }
                    sendEvent("onBondStateChanged", mapOf(
                        "id" to device.address,
                        "name" to name,
                        "paired" to (state == BluetoothDevice.BOND_BONDED),
                        "bonding" to (state == BluetoothDevice.BOND_BONDING),
                        "cancelled" to (state == BluetoothDevice.BOND_NONE && prev == BluetoothDevice.BOND_BONDING)
                    ))
                }
            }
        }
    }

    private fun ensureInquiryReceiver() {
        if (inquiryReceiverContext != null) return
        val receiverContext = context().applicationContext
        val filter = IntentFilter().apply {
            addAction(BluetoothAdapter.ACTION_DISCOVERY_STARTED)
            addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED)
        }
        registerDiscoveryReceiver(inquiryReceiver, filter, receiverContext)
        inquiryReceiverContext = receiverContext
    }

    private fun registerDiscoveryReceiver(
        receiver: BroadcastReceiver,
        filter: IntentFilter,
        receiverContext: Context
    ) {
        if (Build.VERSION.SDK_INT >= 33) {
            receiverContext.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED)
        } else {
            receiverContext.registerReceiver(receiver, filter)
        }
    }

    fun stopDiscoveryRequest() {
        discoveryTurn.cancelWait(inquiry)
        if (!discoveryTurn.tryAcquire(inquiry)) {
            clearDiscoveryReceiver()
            return
        }
        try {
            stopDiscoveryInternal(bluetoothAdapter())
        } finally {
            releaseIdleInquiry()
        }
    }

    private fun stopDiscoveryInternal(adapter: BluetoothAdapter?) {
        inquiry.stop()
        clearDiscoveryReceiver()
        if (adapter == null) return
        val isDiscovering = adapter.isDiscovering
        if (!isDiscovering && !inquiry.awaitingFinish) return
        ensureInquiryReceiver()
        if (!inquiry.awaitingFinish) inquiry.cancellingActiveInquiry()
        cancelInquiry(adapter, isDiscovering)
    }

    private fun cancelInquiry(adapter: BluetoothAdapter, isDiscovering: Boolean) {
        inquiry.discoveryStarted(isDiscovering) { cancelAdapterDiscovery(adapter) }
        watchInquiry(adapter)
    }

    private fun cancelAdapterDiscovery(adapter: BluetoothAdapter): Boolean =
        runCatching { adapter.cancelDiscovery() }.getOrDefault(false)

    private fun clearInquiryCheck() {
        inquiryCheck?.let { mainHandler.removeCallbacks(it) }
        inquiryCheck = null
    }

    private fun clearDiscoveryReceiver() {
        discoveryTimeout?.let { mainHandler.removeCallbacks(it) }
        discoveryTimeout = null
        discoveryReceiver?.let {
            runCatching { inquiryReceiverContext?.unregisterReceiver(it) }
            discoveryReceiver = null
        }
    }

    private companion object {
        val discoveryTurn = BluetoothDiscoveryTurn()
    }
}
