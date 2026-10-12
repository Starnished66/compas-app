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
import android.util.Base64
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import java.io.BufferedInputStream
import java.io.ByteArrayOutputStream
import java.io.EOFException
import java.io.IOException
import java.io.InputStream
import java.nio.charset.StandardCharsets
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledThreadPoolExecutor
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
import java.net.SocketTimeoutException
import java.util.concurrent.ExecutionException

val COMPAS_REMOTE_UUID: UUID = UUID.fromString("9d2f8a7e-6b4c-4d51-8e43-38f7a2c0b719")

class CompasBluetoothModule : Module() {
    private val context: Context
        get() = appContext.reactContext ?: throw IllegalStateException("React context is unavailable")

    private val bluetoothAdapter: BluetoothAdapter?
        get() {
            val manager = context.getSystemService(BluetoothManager::class.java)
            return manager?.adapter ?: BluetoothAdapter.getDefaultAdapter()
        }

    private var discoveryReceiver: BroadcastReceiver? = null
    private val mainHandler = Handler(Looper.getMainLooper())
    private var discoveryTimeout: Runnable? = null
    private val pendingPairing = ConcurrentHashMap.newKeySet<String>()
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

        AsyncFunction("startDiscovery") { promise: Promise ->
            try {
                val adapter = bluetoothAdapter
                if (adapter == null) {
                    promise.reject("BLUETOOTH_UNAVAILABLE", "Bluetooth is not available", null)
                    return@AsyncFunction
                }
                stopDiscoveryInternal(cancelAdapterDiscovery = true)

                val receiver = object : BroadcastReceiver() {
                    private val candidates = LinkedHashMap<String, Pair<BluetoothDevice, String>>()
                    private val awaitingSdp = LinkedHashSet<String>()
                    private val verifiedIds = LinkedHashSet<String>()
                    private var inquiryComplete = false
                    private var completed = false

                    private fun displayName(name: String?, address: String): String? =
                        name?.trim()?.takeIf { it.isNotEmpty() && !it.equals(address, ignoreCase = true) }

                    fun addBondedDevice(device: BluetoothDevice) {
                        addCandidate(device, runCatching { device.name }.getOrNull())
                    }

                    private fun addCandidate(device: BluetoothDevice, rawName: String?) {
                        val name = displayName(rawName, device.address) ?: return
                        if (completed) return
                        candidates[device.address] = device to name
                        if (inquiryComplete) requestSdp(device)
                    }

                    private fun requestSdp(device: BluetoothDevice) {
                        val id = device.address
                        if (id in verifiedIds || id in awaitingSdp || completed) return
                        awaitingSdp.add(id)
                        val started = runCatching { device.fetchUuidsWithSdp() }.getOrDefault(false)
                        if (!started) awaitingSdp.remove(id)
                    }

                    private fun finishIfReady() {
                        if (inquiryComplete && awaitingSdp.isEmpty()) finish()
                    }

                    private fun finish() {
                        if (completed || discoveryReceiver !== this) return
                        completed = true
                        discoveryTimeout?.let { mainHandler.removeCallbacks(it) }
                        discoveryTimeout = null
                        sendEvent("onDiscoveryFinished", emptyMap<String, Any>())
                    }

                    override fun onReceive(context: Context, intent: Intent) {
                        when (intent.action) {
                            BluetoothDevice.ACTION_FOUND, BluetoothDevice.ACTION_NAME_CHANGED -> {
                                @Suppress("DEPRECATION")
                                val device = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE) as? BluetoothDevice ?: return
                                addCandidate(device, intent.getStringExtra(BluetoothDevice.EXTRA_NAME)
                                    ?: runCatching { device.name }.getOrNull())
                            }
                            BluetoothDevice.ACTION_UUID -> {
                                @Suppress("DEPRECATION")
                                val device = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE) as? BluetoothDevice ?: return
                                val id = device.address
                                if (!awaitingSdp.remove(id) || completed) return
                                @Suppress("DEPRECATION")
                                val uuids = intent.getParcelableArrayExtra(BluetoothDevice.EXTRA_UUID)
                                    ?.filterIsInstance<ParcelUuid>().orEmpty()
                                if (uuids.any { it.uuid == COMPAS_REMOTE_UUID }) {
                                    val name = candidates[id]?.second
                                    if (name != null) {
                                        verifiedIds.add(id)
                                        sendEvent("onDeviceFound", mapOf(
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
                            BluetoothAdapter.ACTION_DISCOVERY_FINISHED -> {
                                inquiryComplete = true
                                candidates.values.toList().forEach { (device, _) -> requestSdp(device) }
                                if (awaitingSdp.isEmpty()) {
                                    finish()
                                } else {
                                    val timeout = Runnable { finish() }
                                    discoveryTimeout = timeout
                                    mainHandler.postDelayed(timeout, 25_000L)
                                }
                            }
                        }
                    }
                }
                val filter = IntentFilter().apply {
                    addAction(BluetoothDevice.ACTION_FOUND)
                    addAction(BluetoothDevice.ACTION_NAME_CHANGED)
                    addAction(BluetoothDevice.ACTION_UUID)
                    addAction(BluetoothDevice.ACTION_BOND_STATE_CHANGED)
                    addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED)
                }
                if (Build.VERSION.SDK_INT >= 33) {
                    context.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED)
                } else {
                    context.registerReceiver(receiver, filter)
                }
                discoveryReceiver = receiver
                adapter.bondedDevices.orEmpty().forEach { receiver.addBondedDevice(it) }
                val started = adapter.startDiscovery()
                if (!started) stopDiscoveryInternal(cancelAdapterDiscovery = false)
                promise.resolve(started)
            } catch (e: Exception) {
                promise.reject("DISCOVERY_FAILED", e.message, e)
            }
        }

        AsyncFunction("stopDiscovery") { promise: Promise ->
            try {
                stopDiscoveryInternal(cancelAdapterDiscovery = true)
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("STOP_DISCOVERY_FAILED", e.message, e)
            }
        }

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

        AsyncFunction("executeRfcommRequest") { deviceId: String, method: String, target: String, headers: Map<String, String>?, isArtwork: Boolean, artworkIndex: Double?, bodyBase64: String?, promise: Promise ->
            val idx = artworkIndex?.toLong()
            val exchange = if (isArtwork) {
                ArtworkExchange(idx).also { ex ->
                    synchronized(artworkLock) { activeArtworkExchanges.add(ex) }
                }
            } else null

            rfcommRequestExecutor.submit {
                var socket: BluetoothSocket? = null
                try {
                    val adapter = bluetoothAdapter ?: throw IOException("Bluetooth adapter not available")
                    runCatching { adapter.cancelDiscovery() }

                    if (exchange != null && exchange.preempted) {
                        throw IOException("Artwork request preempted by foreground command")
                    }

                    val device = adapter.getRemoteDevice(deviceId)
                    var connectedSocket: BluetoothSocket? = null

                    for (attempt in 0..1) {
                        if (exchange != null && exchange.preempted) {
                            throw IOException("Artwork request preempted by foreground command")
                        }
                        val candidate = device.createRfcommSocketToServiceRecord(COMPAS_REMOTE_UUID)
                        if (exchange != null) {
                            synchronized(artworkLock) {
                                if (exchange.preempted) {
                                    runCatching { candidate.close() }
                                    throw IOException("Artwork request preempted by foreground command")
                                }
                                exchange.socket = candidate
                            }
                        }
                        val connectExecutor = Executors.newSingleThreadExecutor { task ->
                            Thread(task, "compas-rfcomm-connect").apply { isDaemon = true }
                        }
                        try {
                            val connecting = connectExecutor.submit { candidate.connect() }
                            try {
                                connecting.get(15_000, TimeUnit.MILLISECONDS)
                            } catch (timeout: TimeoutException) {
                                connecting.cancel(true)
                                throw SocketTimeoutException("Timed out connecting to Compás over Bluetooth").apply {
                                    initCause(timeout)
                                }
                            }
                            connectedSocket = candidate
                            break
                        } catch (e: Exception) {
                            runCatching { candidate.close() }
                            val failure = (e as? ExecutionException)?.cause ?: e
                            // Match the Android transport: retry transient I/O failures, but do not
                            // turn a 15-second connect timeout into a second 15-second wait.
                            if (failure is IOException && failure !is SocketTimeoutException &&
                                attempt == 0 && exchange?.preempted != true
                            ) {
                                Thread.sleep(250)
                            } else {
                                throw failure
                            }
                        } finally {
                            connectExecutor.shutdownNow()
                        }
                    }

                    val activeSocket = connectedSocket ?: throw IOException("Could not connect to Compás over Bluetooth")
                    socket = activeSocket
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
                        promise.resolve(mapOf(
                            "statusCode" to response.statusCode,
                            "reason" to response.reason,
                            "headers" to response.headers,
                            "bodyBase64" to base64Body
                        ))
                    } finally {
                        responseTimeout.cancel(false)
                    }
                } catch (e: Exception) {
                    if (exchange != null && exchange.preempted) {
                        promise.reject("ARTWORK_PREEMPTED", "Artwork request was preempted", e)
                    } else {
                        promise.reject("RFCOMM_ERROR", e.message, e)
                    }
                } finally {
                    if (exchange != null) {
                        synchronized(artworkLock) {
                            activeArtworkExchanges.remove(exchange)
                            exchange.socket = null
                        }
                    }
                    runCatching { socket?.close() }
                }
            }
        }

        OnDestroy {
            stopDiscoveryInternal(cancelAdapterDiscovery = true)
            synchronized(artworkLock) {
                activeArtworkExchanges.forEach { exchange ->
                    exchange.preempted = true
                    exchange.socket?.let { socket -> runCatching { socket.close() } }
                }
                activeArtworkExchanges.clear()
            }
            rfcommRequestExecutor.shutdownNow()
        }
    }

    private fun stopDiscoveryInternal(cancelAdapterDiscovery: Boolean) {
        discoveryTimeout?.let { mainHandler.removeCallbacks(it) }
        discoveryTimeout = null
        discoveryReceiver?.let {
            runCatching { context.unregisterReceiver(it) }
            discoveryReceiver = null
        }
        if (cancelAdapterDiscovery) {
            runCatching {
                bluetoothAdapter?.takeIf { it.isDiscovering }?.cancelDiscovery()
            }
        }
    }

    private data class ParsedResponse(
        val statusCode: Int,
        val reason: String,
        val headers: Map<String, String>,
        val body: ByteArray
    )

    private companion object {
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
