package com.compas.remote.bluetooth

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import android.os.SystemClock
import android.util.Base64
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import java.io.BufferedInputStream
import java.io.ByteArrayOutputStream
import java.io.EOFException
import java.io.IOException
import java.io.InputStream
import java.nio.charset.StandardCharsets
import java.util.UUID
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledThreadPoolExecutor
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
import java.net.SocketTimeoutException
import java.util.concurrent.ExecutionException
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.atomic.AtomicBoolean

val COMPAS_REMOTE_UUID: UUID = UUID.fromString("9d2f8a7e-6b4c-4d51-8e43-38f7a2c0b719")

class CompasBluetoothModule : Module() {
    private val context: Context
        get() = appContext.reactContext ?: throw IllegalStateException("React context is unavailable")

    private val bluetoothAdapter: BluetoothAdapter?
        get() = adapterFor(context)

    private fun adapterFor(context: Context): BluetoothAdapter? =
        context.getSystemService(BluetoothManager::class.java)?.adapter ?: BluetoothAdapter.getDefaultAdapter()

    private var discoveryReceiver: BroadcastReceiver? = null
    private val mainHandler = Handler(Looper.getMainLooper())
    private var discoveryTimeout: Runnable? = null
    private var inquiryCheck: Runnable? = null
    private val inquiry = BluetoothInquiry()
    private var inquiryReceiverContext: Context? = null
    private val inquiryReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (!discoveryTurn.owns(inquiry) || !inquiry.awaitingFinish ||
                (destroyed && !inquiry.waitingAfterDestroy)) return
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
    private val pendingPairing = ConcurrentHashMap.newKeySet<String>()
    private val pairingBlockLock = Any()
    private val pairingBlockedDeviceIds = ConcurrentHashMap.newKeySet<String>()
    private val rfcommDeviceIds = ConcurrentHashMap.newKeySet<String>()
    private var pairingReceiver: BroadcastReceiver? = null
    private var pairingReceiverContext: Context? = null
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
    @Volatile private var destroyed = false

    override fun definition() = ModuleDefinition {
        Name("CompasBluetooth")

        Events("onDeviceFound", "onBondStateChanged", "onDiscoveryFinished")

        AsyncFunction("getBondedDevices") { promise: Promise ->
            try {
                val adapter = bluetoothAdapter
                if (adapter == null) {
                    promise.resolve(emptyList<Map<String, Any>>())
                    return@AsyncFunction
                }
                val bonded = adapter.bondedDevices.orEmpty()
                    .sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it.name.orEmpty() })
                    .map { device ->
                        mapOf(
                            "id" to device.address,
                            "name" to (device.name ?: device.address),
                            "paired" to true,
                            "bonding" to false
                        )
                    }
                promise.resolve(bonded)
            } catch (e: Exception) {
                promise.reject("BLUETOOTH_ERROR", e.message, e)
            }
        }

        AsyncFunction("startDiscovery") { scanId: Double, promise: Promise ->
            requestDiscovery(scanId, promise)
        }.runOnQueue(Queues.MAIN)

        AsyncFunction("stopDiscovery") { promise: Promise ->
            try {
                if (!destroyed) stopDiscoveryRequest()
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("STOP_DISCOVERY_FAILED", e.message, e)
            }
        }.runOnQueue(Queues.MAIN)

        AsyncFunction("pairDevice") { deviceId: String, promise: Promise ->
            try {
                val adapter = bluetoothAdapter ?: throw IllegalStateException("Bluetooth unavailable")
                val device = adapter.getRemoteDevice(deviceId)
                if (device.bondState == BluetoothDevice.BOND_BONDED) {
                    promise.resolve(true)
                    return@AsyncFunction
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

        AsyncFunction("preemptArtwork") { index: Double?, promise: Promise ->
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

        AsyncFunction("resetPairingBlock") { deviceId: String, promise: Promise ->
            val normalizedId = normalizeDeviceId(deviceId)
            synchronized(pairingBlockLock) {
                if (normalizedId in pairingBlockedDeviceIds) {
                    rejectRfcommRequestsForDevice(normalizedId, "RFCOMM_CANCELLED", "Bluetooth request was cancelled")
                    pairingBlockedDeviceIds.remove(normalizedId)
                }
            }
            promise.resolve(true)
        }

        AsyncFunction("executeRfcommRequest") { deviceId: String, method: String, target: String, headers: Map<String, String>?, isArtwork: Boolean, artworkIndex: Double?, bodyBase64: String?, promise: Promise ->
            val normalizedId = normalizeDeviceId(deviceId)
            val pending = PendingRfcommRequest(normalizedId, promise)
            rfcommDeviceIds.add(normalizedId)
            pendingRfcommRequests.add(pending)
            // Checked after registering so a concurrent OnDestroy either sees this request or we see the flag.
            if (destroyed) {
                pendingRfcommRequests.remove(pending)
                pending.reject("MODULE_DESTROYED", "Bluetooth module was destroyed", null)
                return@AsyncFunction
            }
            try {
                ensurePairingReceiverRegistered()
            } catch (e: Exception) {
                pendingRfcommRequests.remove(pending)
                pending.reject("BLUETOOTH_ERROR", e.message, e)
                return@AsyncFunction
            }
            val idx = artworkIndex?.toLong()
            val exchange = if (isArtwork) {
                ArtworkExchange(idx).also { ex ->
                    synchronized(artworkLock) { activeArtworkExchanges.add(ex) }
                }
            } else null

            val task = Runnable {
                var socket: BluetoothSocket? = null
                try {
                    if (pending.isSettled) return@Runnable
                    val adapter = bluetoothAdapter ?: throw IOException("Bluetooth adapter not available")
                    if (!adapter.isEnabled) throw IOException("Bluetooth adapter is disabled")
                    runCatching { adapter.cancelDiscovery() }

                    if (exchange != null && exchange.preempted) {
                        throw IOException("Artwork request preempted by foreground command")
                    }

                    val device = adapter.getRemoteDevice(deviceId)
                    val candidate = synchronized(pairingBlockLock) {
                        if (pending.isSettled) return@Runnable
                        if (destroyed) throw IOException("Bluetooth module was destroyed")
                        if (normalizedId in pairingBlockedDeviceIds) throw PairingRequiredException()
                        if (!adapter.isEnabled) throw IOException("Bluetooth adapter is disabled")
                        if (device.bondState != BluetoothDevice.BOND_BONDED) {
                            pairingBlockedDeviceIds.add(normalizedId)
                            rejectRfcommRequestsForDevice(normalizedId)
                            throw PairingRequiredException()
                        }
                        device.createRfcommSocketToServiceRecord(COMPAS_REMOTE_UUID).also { pending.socket = it }
                    }
                    if (destroyed) {
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
                    val connectExecutor = Executors.newSingleThreadExecutor { connectTask ->
                        Thread(connectTask, "compas-rfcomm-connect").apply { isDaemon = true }
                    }
                    val activeSocket: BluetoothSocket
                    try {
                        val connecting = connectExecutor.submit {
                            synchronized(pairingBlockLock) {
                                if (pending.isSettled) throw IOException("Bluetooth request was cancelled")
                                if (normalizedId in pairingBlockedDeviceIds) throw PairingRequiredException()
                                if (!adapter.isEnabled) throw IOException("Bluetooth adapter is disabled")
                                if (device.bondState != BluetoothDevice.BOND_BONDED) {
                                    pairingBlockedDeviceIds.add(normalizedId)
                                    rejectRfcommRequestsForDevice(normalizedId)
                                    throw PairingRequiredException()
                                }
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
                        activeSocket = candidate
                    } catch (e: Exception) {
                        runCatching { candidate.close() }
                        throw ((e as? ExecutionException)?.cause ?: e)
                    } finally {
                        connectExecutor.shutdownNow()
                    }
                    socket = activeSocket
                    pending.socket = activeSocket
                    if (exchange != null) {
                        synchronized(artworkLock) { exchange.socket = activeSocket }
                    }

                    // RFCOMM has no read timeout. Close the socket if the player never
                    // answers so the JS connection attempt can fail instead of hanging.
                    val responseTimeoutMs = if (bodyBase64 != null) 30_000L else if (exchange != null) 20_000L else 5_000L
                    val responseTimeout = responseTimeoutExecutor.schedule(
                        { runCatching { activeSocket.close() } },
                        responseTimeoutMs,
                        TimeUnit.MILLISECONDS
                    )
                    try {
                        val requestBody = bodyBase64?.let { Base64.decode(it, Base64.DEFAULT) }
                        if (requestBody != null && requestBody.size > 256 * 1024) throw IOException("Playlist file is too large")
                        val headerEntries = headers?.entries?.joinToString("") { (name, value) -> "$name: $value\r\n" }.orEmpty()
                        val bodyLengthHeader = if (requestBody != null && headers?.keys?.none { it.equals("Content-Length", ignoreCase = true) } != false) {
                            "Content-Length: ${requestBody.size}\r\n"
                        } else ""
                        val wire = "$method $target HTTP/1.1\r\nHost: compas\r\n${headerEntries}${bodyLengthHeader}Connection: close\r\n\r\n"
                        val out = activeSocket.outputStream
                        out.write(wire.toByteArray(StandardCharsets.US_ASCII))
                        if (requestBody != null) out.write(requestBody)
                        out.flush()

                        val response = parseHttpResponse(activeSocket.inputStream)
                        val base64Body = Base64.encodeToString(response.body, Base64.NO_WRAP)
                        pending.resolve(mapOf(
                            "statusCode" to response.statusCode,
                            "reason" to response.reason,
                            "headers" to response.headers,
                            "bodyBase64" to base64Body
                        ))
                    } finally {
                        responseTimeout.cancel(false)
                    }
                } catch (e: Exception) {
                    if (destroyed) {
                        pending.reject("MODULE_DESTROYED", "Bluetooth module was destroyed", e)
                    } else if (e is PairingRequiredException) {
                        pending.reject("BLUETOOTH_PAIRING_REQUIRED", PAIRING_REQUIRED_MESSAGE, e)
                    } else if (pending.isSettled) {
                        // The pairing receiver or an explicit reset already settled this request.
                    } else if (exchange != null && exchange.preempted) {
                        pending.reject("ARTWORK_PREEMPTED", "Artwork request was preempted", e)
                    } else {
                        pending.reject("RFCOMM_ERROR", e.message, e)
                    }
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
            try {
                rfcommRequestExecutor.execute(task)
            } catch (e: RejectedExecutionException) {
                pendingRfcommRequests.remove(pending)
                exchange?.let { ex -> synchronized(artworkLock) { activeArtworkExchanges.remove(ex) } }
                pending.reject("MODULE_DESTROYED", "Bluetooth module was destroyed", e)
            }
        }

        OnDestroy {
            synchronized(pairingBlockLock) {
                destroyed = true
                pairingReceiver?.let { receiver ->
                    runCatching { pairingReceiverContext?.unregisterReceiver(receiver) }
                    pairingReceiver = null
                    pairingReceiverContext = null
                }
            }
            val cleanupDiscovery = Runnable { destroyDiscovery() }
            if (Looper.myLooper() == Looper.getMainLooper()) cleanupDiscovery.run()
            else mainHandler.post(cleanupDiscovery)
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
    }

    private fun destroyDiscovery() {
        discoveryTurn.cancelWait(inquiry)
        clearDiscoveryReceiver()
        val receiverContext = inquiryReceiverContext
        val timeout = Runnable { inquiry.destroyTimedOut() }
        inquiry.destroy(
            cancelIfActive = {
                runCatching {
                    val adapter = receiverContext?.let(::adapterFor)
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

    private fun requestDiscovery(scanId: Double, promise: Promise) {
        if (destroyed) {
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
            val adapter = if (destroyed) null else bluetoothAdapter
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
        if (destroyed) {
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
                        pendingPairing.remove(device.address)
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
        val receiverContext = context.applicationContext
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

    private fun stopDiscoveryRequest() {
        discoveryTurn.cancelWait(inquiry)
        if (!discoveryTurn.tryAcquire(inquiry)) {
            clearDiscoveryReceiver()
            return
        }
        try {
            stopDiscoveryInternal(bluetoothAdapter)
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

    private fun ensurePairingReceiverRegistered() {
        synchronized(pairingBlockLock) {
            if (destroyed || pairingReceiver != null) return
            val receiver = object : BroadcastReceiver() {
                override fun onReceive(context: Context, intent: Intent) {
                    @Suppress("DEPRECATION")
                    val device = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE) as? BluetoothDevice ?: return
                    val id = normalizeDeviceId(device.address)
                    // A pairing broadcast can arrive after the socket already failed, between requests.
                    if (id !in rfcommDeviceIds || bluetoothAdapter?.isEnabled != true) return
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
            val receiverContext = context.applicationContext
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
        synchronized(pairingBlockLock) {
            pairingBlockedDeviceIds.add(deviceId)
            rejectRfcommRequestsForDevice(deviceId)
        }
    }

    private fun rejectRfcommRequestsForDevice(
        deviceId: String,
        code: String = "BLUETOOTH_PAIRING_REQUIRED",
        message: String = PAIRING_REQUIRED_MESSAGE
    ) {
        pendingRfcommRequests.filter { it.deviceId == deviceId }.forEach { pending ->
            pending.reject(code, message, null)
            pending.socket?.let { runCatching { it.close() } }
        }
    }

    private fun normalizeDeviceId(deviceId: String): String = deviceId.uppercase(Locale.ROOT)

    private class PairingRequiredException : IOException(PAIRING_REQUIRED_MESSAGE)

    private data class ParsedResponse(
        val statusCode: Int,
        val reason: String,
        val headers: Map<String, String>,
        val body: ByteArray
    )

    private companion object {
        const val PAIRING_REQUIRED_MESSAGE = "Select a paired Bluetooth player first."
        val discoveryTurn = BluetoothDiscoveryTurn()
        val responseTimeoutExecutor = ScheduledThreadPoolExecutor(1) { task ->
            Thread(task, "compas-rfcomm-response-timeout").apply { isDaemon = true }
        }.apply {
            removeOnCancelPolicy = true
        }
    }

    private fun parseHttpResponse(rawInput: InputStream): ParsedResponse {
        val input = if (rawInput is BufferedInputStream) rawInput else BufferedInputStream(rawInput)
        val headerBytes = ByteArrayOutputStream()
        var matched = 0
        while (matched < 4) {
            val b = input.read()
            if (b < 0) throw EOFException("Truncated HTTP headers")
            headerBytes.write(b)
            if (headerBytes.size() > 32 * 1024) throw IllegalArgumentException("HTTP headers too large")
            matched = when {
                matched == 0 && b == 13 -> 1
                matched == 1 && b == 10 -> 2
                matched == 2 && b == 13 -> 3
                matched == 3 && b == 10 -> 4
                b == 13 -> 1
                else -> 0
            }
        }
        val raw = String(headerBytes.toByteArray(), StandardCharsets.ISO_8859_1)
        val lines = raw.removeSuffix("\r\n\r\n").split("\r\n")
        val status = Regex("^HTTP/1\\.[01] ([0-9]{3})(?: (.*))?$").matchEntire(lines.firstOrNull().orEmpty())
            ?: throw IllegalArgumentException("Invalid HTTP status line")
        val headers = mutableMapOf<String, String>()
        for (line in lines.drop(1)) {
            val colon = line.indexOf(':')
            if (colon <= 0) throw IllegalArgumentException("Invalid HTTP header")
            val key = line.substring(0, colon).trim().lowercase()
            val value = line.substring(colon + 1).trim()
            headers[key] = if (headers.containsKey(key)) "${headers[key]}, $value" else value
        }
        val rawLength = headers["content-length"]
            ?: throw IllegalArgumentException("Missing or invalid Content-Length")
        if (rawLength.isEmpty() || rawLength.any { !it.isDigit() }) {
            throw IllegalArgumentException("Missing or invalid Content-Length")
        }
        val length = rawLength.toLongOrNull()
            ?: throw IllegalArgumentException("Missing or invalid Content-Length")
        if (length > 8 * 1024 * 1024) throw IllegalArgumentException("HTTP body exceeds limit")
        if (headers.containsKey("transfer-encoding")) {
            throw IllegalArgumentException("Transfer-Encoding is unsupported")
        }
        val body = ByteArray(length.toInt())
        var offset = 0
        while (offset < body.size) {
            val read = input.read(body, offset, body.size - offset)
            if (read < 0) throw EOFException("Truncated HTTP body")
            offset += read
        }
        return ParsedResponse(status.groupValues[1].toInt(), status.groupValues.getOrElse(2) { "" }, headers, body)
    }
}
