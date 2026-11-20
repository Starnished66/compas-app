package com.compas.remote.bluetooth

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothSocket
import expo.modules.kotlin.Promise
import java.io.IOException
import java.net.SocketTimeoutException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ExecutionException
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
import java.util.concurrent.atomic.AtomicBoolean

internal class BluetoothRfcomm(
    private val bluetoothAdapter: () -> BluetoothAdapter?,
    private val pairing: BluetoothPairing,
    private val isDestroyed: () -> Boolean,
) {
    /** Reuse one worker: creating an executor for every request leaked a native thread per call. */
    private val rfcommRequestExecutor = Executors.newSingleThreadExecutor { task ->
        Thread(task, "compas-rfcomm-request").apply { isDaemon = true }
    }

    private class ArtworkExchange(val index: Long?) {
        @Volatile var preempted = false
        @Volatile var socket: BluetoothSocket? = null
    }

    private val artworkLock = Any()
    private val activeArtworkExchanges = LinkedHashSet<ArtworkExchange>()

    /** Settles its promise once, so OnDestroy and a still-running worker can't both settle it. */
    private class PendingRfcommRequest(val deviceId: String, private val promise: Promise) {
        private val settled = AtomicBoolean(false)
        @Volatile var socket: BluetoothSocket? = null
        val isSettled: Boolean get() = settled.get()

        fun resolve(value: Any?) {
            if (settled.compareAndSet(false, true)) promise.resolve(value)
        }

        fun reject(code: String, message: String?, cause: Throwable?) {
            if (settled.compareAndSet(false, true)) promise.reject(code, message, cause)
        }
    }

    // shutdownNow() drops queued tasks; OnDestroy rejects these so JS awaits don't hang on reload.
    private val pendingRfcommRequests = ConcurrentHashMap.newKeySet<PendingRfcommRequest>()

    fun preemptArtwork(index: Double?, promise: Promise) {
        val idx = index?.toLong()
        var count = 0
        synchronized(artworkLock) {
            for (exchange in activeArtworkExchanges) {
                if (idx == null || exchange.index == idx) {
                    exchange.preempted = true
                    exchange.socket?.let { s -> runCatching { s.close() } }
                    count++
                }
            }
        }
        promise.resolve(count)
    }

    fun execute(
        deviceId: String, method: String, target: String, headers: Map<String, String>?,
        isArtwork: Boolean, artworkIndex: Double?, bodyBase64: String?, promise: Promise,
    ) {
        val normalizedId = normalizeDeviceId(deviceId)
        val pending = PendingRfcommRequest(normalizedId, promise)
        pairing.noteRfcommDevice(normalizedId)
        pendingRfcommRequests.add(pending)
        // Checked after registering so a concurrent OnDestroy either sees this request or we see the flag.
        if (isDestroyed()) {
            pendingRfcommRequests.remove(pending)
            pending.reject("MODULE_DESTROYED", "Bluetooth module was destroyed", null)
            return
        }
        try {
            pairing.ensureReceiverRegistered()
        } catch (e: Exception) {
            pendingRfcommRequests.remove(pending)
            pending.reject("BLUETOOTH_ERROR", e.message, e)
            return
        }
        val idx = artworkIndex?.toLong()
        val exchange = if (isArtwork) {
            ArtworkExchange(idx).also { ex ->
                synchronized(artworkLock) { activeArtworkExchanges.add(ex) }
            }
        } else null

        val request = RfcommHttpRequest(method, target, headers, bodyBase64)
        val task = Runnable { runRequest(pending, deviceId, normalizedId, exchange, request) }
        try {
            rfcommRequestExecutor.execute(task)
        } catch (e: RejectedExecutionException) {
            pendingRfcommRequests.remove(pending)
            exchange?.let { ex -> synchronized(artworkLock) { activeArtworkExchanges.remove(ex) } }
            pending.reject("MODULE_DESTROYED", "Bluetooth module was destroyed", e)
        }
    }

    private fun runRequest(
        pending: PendingRfcommRequest, deviceId: String, normalizedId: String,
        exchange: ArtworkExchange?, request: RfcommHttpRequest,
    ) {
        var socket: BluetoothSocket? = null
        try {
            if (pending.isSettled) return
            val adapter = bluetoothAdapter() ?: throw IOException("Bluetooth adapter not available")
            if (!adapter.isEnabled) throw IOException("Bluetooth adapter is disabled")
            runCatching { adapter.cancelDiscovery() }

            if (exchange != null && exchange.preempted) {
                throw IOException("Artwork request preempted by foreground command")
            }

            val device = adapter.getRemoteDevice(deviceId)
            val candidate = synchronized(pairing.lock) {
                if (pending.isSettled) return
                if (isDestroyed()) throw IOException("Bluetooth module was destroyed")
                pairing.requireBondedLocked(adapter, device, normalizedId)
                device.createRfcommSocketToServiceRecord(COMPAS_REMOTE_UUID).also { pending.socket = it }
            }
            if (isDestroyed()) {
                runCatching { candidate.close() }
                throw IOException("Bluetooth module was destroyed")
            }
            if (exchange != null) {
                synchronized(artworkLock) {
                    if (exchange.preempted) {
                        runCatching { candidate.close() }
                        throw IOException("Artwork request preempted by foreground command")
                    }
                    exchange.socket = candidate
                }
            }
            val activeSocket = connectSocket(candidate, adapter, device, normalizedId, pending)
            socket = activeSocket
            pending.socket = activeSocket
            if (exchange != null) {
                synchronized(artworkLock) { exchange.socket = activeSocket }
            }

            exchangeHttp(activeSocket, request, exchange != null, pending::resolve)
        } catch (e: Exception) {
            rejectFailedRequest(pending, exchange, e)
        } finally {
            pendingRfcommRequests.remove(pending)
            pending.socket = null
            if (exchange != null) {
                synchronized(artworkLock) {
                    activeArtworkExchanges.remove(exchange)
                    exchange.socket = null
                }
            }
            runCatching { socket?.close() }
        }
    }

    private fun rejectFailedRequest(pending: PendingRfcommRequest, exchange: ArtworkExchange?, error: Exception) {
        if (isDestroyed()) {
            pending.reject("MODULE_DESTROYED", "Bluetooth module was destroyed", error)
        } else if (error is PairingRequiredException) {
            pending.reject("BLUETOOTH_PAIRING_REQUIRED", PAIRING_REQUIRED_MESSAGE, error)
        } else if (pending.isSettled) {
            // The pairing receiver or an explicit reset already settled this request.
        } else if (exchange != null && exchange.preempted) {
            pending.reject("ARTWORK_PREEMPTED", "Artwork request was preempted", error)
        } else {
            pending.reject("RFCOMM_ERROR", error.message, error)
        }
    }

    private fun connectSocket(
        candidate: BluetoothSocket, adapter: BluetoothAdapter, device: BluetoothDevice,
        normalizedId: String, pending: PendingRfcommRequest,
    ): BluetoothSocket {
        val connectExecutor = Executors.newSingleThreadExecutor { connectTask ->
            Thread(connectTask, "compas-rfcomm-connect").apply { isDaemon = true }
        }
        try {
            val connecting = connectExecutor.submit {
                synchronized(pairing.lock) {
                    if (pending.isSettled) throw IOException("Bluetooth request was cancelled")
                    pairing.requireBondedLocked(adapter, device, normalizedId)
                }
                candidate.connect()
            }
            try {
                connecting.get(15_000, TimeUnit.MILLISECONDS)
            } catch (timeout: TimeoutException) {
                connecting.cancel(true)
                throw SocketTimeoutException("Timed out connecting to Compás over Bluetooth").apply {
                    initCause(timeout)
                }
            }
            return candidate
        } catch (e: Exception) {
            runCatching { candidate.close() }
            throw ((e as? ExecutionException)?.cause ?: e)
        } finally {
            connectExecutor.shutdownNow()
        }
    }

    fun destroy() {
        synchronized(artworkLock) {
            activeArtworkExchanges.forEach { exchange ->
                exchange.preempted = true
                exchange.socket?.let { socket -> runCatching { socket.close() } }
            }
            activeArtworkExchanges.clear()
        }
        rfcommRequestExecutor.shutdownNow()
        pendingRfcommRequests.forEach { pending ->
            pending.socket?.let { socket -> runCatching { socket.close() } }
            pending.reject("MODULE_DESTROYED", "Bluetooth module was destroyed", null)
        }
        pendingRfcommRequests.clear()
    }

    fun rejectRfcommRequestsForDevice(
        deviceId: String,
        code: String,
        message: String
    ) {
        pendingRfcommRequests.filter { it.deviceId == deviceId }.forEach { pending ->
            pending.reject(code, message, null)
            pending.socket?.let { runCatching { it.close() } }
        }
    }
}
