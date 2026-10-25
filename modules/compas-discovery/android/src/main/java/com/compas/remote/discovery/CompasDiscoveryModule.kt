package com.compas.remote.discovery

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.Inet4Address
import java.net.InetAddress
import java.net.SocketException
import java.net.SocketTimeoutException
import java.nio.charset.StandardCharsets
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong

private const val SERVICE_TYPE = "_compas-remote._tcp."
private const val DEFAULT_PORT = 8899
private const val UDP_DISCOVERY_PORT = 8899
private const val UDP_DISCOVERY_REQUEST_SIZE = 32
private const val UDP_DISCOVERY_WINDOW_MS = 4_000L
private const val UDP_DISCOVERY_INTERVAL_MS = 1_000L
private const val RESOLVE_RETRY_DELAY_MS = 300L
private const val RESOLVE_MAX_RETRIES = 5
private val UDP_DISCOVERY_REQUEST = ByteArray(UDP_DISCOVERY_REQUEST_SIZE).also {
    "COMPAS_REMOTE_DISCOVER_V1".toByteArray(StandardCharsets.US_ASCII).copyInto(it)
}
private val UDP_DISCOVERY_REPLY = "COMPAS_REMOTE_V1 8899\n".toByteArray(StandardCharsets.US_ASCII)

class CompasDiscoveryModule : Module() {
    private val context: Context
        get() = appContext.reactContext ?: throw IllegalStateException("React context is unavailable")

    private var nsdManager: NsdManager? = null
    private var discoveryListener: NsdManager.DiscoveryListener? = null
    private var multicastLock: WifiManager.MulticastLock? = null
    private val resolvingServices = ConcurrentHashMap.newKeySet<String>()
    // Before API 34 NsdManager allows one resolve at a time and fails the rest with
    // FAILURE_ALREADY_ACTIVE, so resolves are queued and run one by one (guarded by nsdLifecycleLock).
    private val resolveQueue = ArrayDeque<NsdServiceInfo>()
    private val resolveRetries = HashMap<String, Int>()
    private var resolveInFlightName: String? = null
    private var activeResolveListener: NsdManager.ResolveListener? = null
    private val resolveRetryHandler = Handler(Looper.getMainLooper())
    // Guarded by discoveryLifecycleLock: JS asked for discovery, and it is paused while backgrounded.
    private var discoveryRequested = false
    private var pausedForBackground = false
    private val nsdGeneration = AtomicLong(0)
    private val nsdLifecycleLock = Any()
    private val discoveryLifecycleLock = Any()
    private val udpGeneration = AtomicLong(0)
    private val udpLifecycleLock = Any()
    @Volatile private var udpSocket: DatagramSocket? = null
    @Volatile private var udpWorker: Thread? = null

    override fun definition() = ModuleDefinition {
        Name("CompasDiscovery")

        Events("onDeviceFound", "onDeviceLost", "onDiscoveryStarted", "onDiscoveryStopped", "onDiscoveryError")

        AsyncFunction("startDiscovery") { promise: Promise ->
            synchronized(discoveryLifecycleLock) {
                discoveryRequested = true
                pausedForBackground = false
                restartUdpFallback()
                try {
                    startNsdDiscovery()
                } catch (_: Exception) {
                    sendEvent("onDiscoveryError", mapOf("errorCode" to -1, "phase" to "start"))
                }
            }
            promise.resolve(true)
        }

        AsyncFunction("stopDiscovery") { promise: Promise ->
            try {
                stopInternal()
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("STOP_FAILED", e.message, e)
            }
        }

        // Don't hold the multicast lock or keep mDNS running while the app is in the background.
        OnActivityEntersBackground {
            pauseForBackground()
        }

        OnActivityEntersForeground {
            resumeFromBackground()
        }

        OnDestroy {
            stopInternal()
        }
    }

    private fun stopInternal() {
        synchronized(discoveryLifecycleLock) {
            discoveryRequested = false
            pausedForBackground = false
            stopUdpFallback()
            stopNsdDiscovery()
        }
    }

    private fun pauseForBackground() {
        synchronized(discoveryLifecycleLock) {
            if (discoveryRequested && !pausedForBackground) {
                pausedForBackground = true
                stopUdpFallback()
                stopNsdDiscovery()
            }
        }
    }

    private fun resumeFromBackground() {
        synchronized(discoveryLifecycleLock) {
            if (pausedForBackground) {
                pausedForBackground = false
                if (discoveryRequested) {
                    restartUdpFallback()
                    try {
                        startNsdDiscovery()
                    } catch (_: Exception) {
                        sendEvent("onDiscoveryError", mapOf("errorCode" to -1, "phase" to "start"))
                    }
                }
            }
        }
    }

    private fun stopNsdDiscovery() {
        synchronized(nsdLifecycleLock) {
            nsdGeneration.incrementAndGet()
            clearNsdDiscoveryLocked()
        }
    }

    private fun startNsdDiscovery() {
        synchronized(nsdLifecycleLock) {
            if (discoveryListener != null) return
            val manager = context.getSystemService(NsdManager::class.java)
            if (manager == null) {
                sendEvent("onDiscoveryError", mapOf("errorCode" to -1, "phase" to "start"))
                return
            }
            val wifi = context.applicationContext.getSystemService(WifiManager::class.java)
            nsdManager = manager
            val generation = nsdGeneration.incrementAndGet()
            try {
                wifi?.createMulticastLock("compas-remote-nsd")?.let { lock ->
                    lock.setReferenceCounted(false)
                    lock.acquire()
                    multicastLock = lock
                }
                val listener = createNsdListener(manager, generation)
                discoveryListener = listener
                manager.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, listener)
            } catch (_: Exception) {
                failNsdDiscoveryLocked(generation, -1, "start")
            }
        }
    }

    private fun createNsdListener(manager: NsdManager, generation: Long) = object : NsdManager.DiscoveryListener {
        override fun onDiscoveryStarted(serviceType: String) {
            synchronized(nsdLifecycleLock) {
                if (generation == nsdGeneration.get()) {
                    sendEvent("onDiscoveryStarted", mapOf("serviceType" to serviceType))
                }
            }
        }

        override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
            failNsdDiscovery(generation, errorCode, "start")
        }

        override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {
            failNsdDiscovery(generation, errorCode, "stop")
        }

        override fun onDiscoveryStopped(serviceType: String) {
            synchronized(nsdLifecycleLock) {
                if (generation == nsdGeneration.get()) {
                    sendEvent("onDiscoveryStopped", mapOf("serviceType" to serviceType))
                }
            }
        }

        override fun onServiceFound(serviceInfo: NsdServiceInfo) {
            synchronized(nsdLifecycleLock) {
                if (generation != nsdGeneration.get() || discoveryListener !== this) return
                if (serviceInfo.serviceType.trimEnd('.') != SERVICE_TYPE.trimEnd('.')) return
                val name = serviceInfo.serviceName ?: return
                if (!resolvingServices.add(name)) return
                resolveQueue.addLast(serviceInfo)
                pumpResolveQueueLocked(manager, generation)
            }
        }

        override fun onServiceLost(serviceInfo: NsdServiceInfo) {
            synchronized(nsdLifecycleLock) {
                if (generation == nsdGeneration.get()) {
                    val name = serviceInfo.serviceName
                    if (name != null && name != resolveInFlightName && resolveQueue.removeAll { it.serviceName == name }) {
                        resolvingServices.remove(name)
                        resolveRetries.remove(name)
                    }
                    sendEvent("onDeviceLost", mapOf(
                        "id" to serviceInfo.serviceName,
                        "name" to serviceInfo.serviceName
                    ))
                }
            }
        }
    }

    private fun pumpResolveQueueLocked(manager: NsdManager, generation: Long) {
        if (generation != nsdGeneration.get()) return
        while (resolveInFlightName == null) {
            val next = resolveQueue.removeFirstOrNull() ?: return
            val name = next.serviceName ?: continue
            val listener = createResolveListener(manager, generation, name)
            resolveInFlightName = name
            activeResolveListener = listener
            try {
                manager.resolveService(next, listener)
            } catch (_: Exception) {
                resolveInFlightName = null
                activeResolveListener = null
                resolvingServices.remove(name)
                resolveRetries.remove(name)
            }
        }
    }

    private fun createResolveListener(manager: NsdManager, generation: Long, serviceName: String) = object : NsdManager.ResolveListener {
        override fun onResolveFailed(info: NsdServiceInfo, errorCode: Int) {
            synchronized(nsdLifecycleLock) {
                if (generation != nsdGeneration.get() || activeResolveListener !== this) return
                resolveInFlightName = null
                activeResolveListener = null
                val attempts = resolveRetries[serviceName] ?: 0
                if (errorCode == NsdManager.FAILURE_ALREADY_ACTIVE && attempts < RESOLVE_MAX_RETRIES) {
                    // A resolve from a previous discovery session (or another client) is still running.
                    resolveRetries[serviceName] = attempts + 1
                    resolveRetryHandler.postDelayed({
                        synchronized(nsdLifecycleLock) {
                            if (generation == nsdGeneration.get() && serviceName in resolvingServices &&
                                serviceName != resolveInFlightName && resolveQueue.none { it.serviceName == serviceName }
                            ) {
                                resolveQueue.addLast(info)
                                pumpResolveQueueLocked(manager, generation)
                            }
                        }
                    }, RESOLVE_RETRY_DELAY_MS)
                } else {
                    resolvingServices.remove(serviceName)
                    resolveRetries.remove(serviceName)
                }
                pumpResolveQueueLocked(manager, generation)
            }
        }

        override fun onServiceResolved(info: NsdServiceInfo) {
            synchronized(nsdLifecycleLock) {
                if (generation != nsdGeneration.get() || activeResolveListener !== this) return
                resolveInFlightName = null
                activeResolveListener = null
                resolvingServices.remove(serviceName)
                resolveRetries.remove(serviceName)
                val host = info.host?.hostAddress
                if (host != null) {
                    val port = info.port
                    val apiAttr = info.attributes?.get("api")?.let { String(it, StandardCharsets.UTF_8) }
                    val endpointHost = if (host.contains(':')) "[$host]" else host
                    val address = "$endpointHost:$port"
                    // Android reports the SRV target without its ".local" suffix ("r1.compas").
                    val hostname = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM) {
                        info.hostname?.trimEnd('.')?.takeIf { it.isNotEmpty() }
                            ?.let { if (it.endsWith(".local", ignoreCase = true)) it else "$it.local" }
                    } else null
                    sendEvent("onDeviceFound", mapOf(
                        "id" to info.serviceName,
                        "name" to info.serviceName,
                        "host" to host,
                        "hostname" to hostname,
                        "port" to port,
                        "address" to address,
                        "apiVersion" to (apiAttr ?: "1")
                    ))
                }
                pumpResolveQueueLocked(manager, generation)
            }
        }
    }

    private fun failNsdDiscovery(generation: Long, errorCode: Int, phase: String) {
        synchronized(nsdLifecycleLock) {
            failNsdDiscoveryLocked(generation, errorCode, phase)
        }
    }

    private fun failNsdDiscoveryLocked(generation: Long, errorCode: Int, phase: String) {
        if (nsdGeneration.get() != generation) return
        nsdGeneration.incrementAndGet()
        clearNsdDiscoveryLocked()
        sendEvent("onDiscoveryError", mapOf("errorCode" to errorCode, "phase" to phase))
    }

    private fun clearNsdDiscoveryLocked() {
        val listener = discoveryListener
        discoveryListener = null
        if (listener != null && nsdManager != null) {
            runCatching { nsdManager?.stopServiceDiscovery(listener) }
        }
        val resolveListener = activeResolveListener
        activeResolveListener = null
        if (resolveListener != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            runCatching { nsdManager?.stopServiceResolution(resolveListener) }
        }
        nsdManager = null
        resolveRetryHandler.removeCallbacksAndMessages(null)
        resolveQueue.clear()
        resolveRetries.clear()
        resolveInFlightName = null
        resolvingServices.clear()
        multicastLock?.let { lock ->
            if (lock.isHeld) {
                runCatching { lock.release() }
            }
        }
        multicastLock = null
    }

    private fun restartUdpFallback() {
        stopUdpFallback()
        startUdpFallback()
    }

    private fun startUdpFallback() {
        synchronized(udpLifecycleLock) {
            if (udpWorker?.isAlive == true) return
            val generation = udpGeneration.incrementAndGet()
            val worker = Thread({ runUdpFallback(generation) }, "compas-udp-discovery").apply {
                isDaemon = true
            }
            udpWorker = worker
            worker.start()
        }
    }

    private fun runUdpFallback(generation: Long) {
        val socket = try {
            DatagramSocket().apply {
                soTimeout = 200
                broadcast = true
            }
        } catch (_: Exception) {
            clearUdpWorker(generation, null)
            return
        }
        synchronized(udpLifecycleLock) {
            if (udpGeneration.get() != generation) {
                socket.close()
                return
            }
            udpSocket = socket
        }

        val deadline = android.os.SystemClock.elapsedRealtime() + UDP_DISCOVERY_WINDOW_MS
        var nextSendAt = 0L
        val seenHosts = HashSet<String>()
        val responseBuffer = ByteArray(UDP_DISCOVERY_REPLY.size + 1)
        try {
            while (udpGeneration.get() == generation && !Thread.currentThread().isInterrupted) {
                val now = android.os.SystemClock.elapsedRealtime()
                if (now >= deadline) break
                if (now >= nextSendAt) {
                    val request = DatagramPacket(
                        UDP_DISCOVERY_REQUEST,
                        UDP_DISCOVERY_REQUEST.size,
                        InetAddress.getByName("255.255.255.255"),
                        UDP_DISCOVERY_PORT,
                    )
                    socket.send(request)
                    nextSendAt = now + UDP_DISCOVERY_INTERVAL_MS
                }

                socket.soTimeout = minOf(200L, deadline - android.os.SystemClock.elapsedRealtime()).toInt().coerceAtLeast(1)
                val packet = DatagramPacket(responseBuffer, responseBuffer.size)
                try {
                    socket.receive(packet)
                } catch (_: SocketTimeoutException) {
                    continue
                } catch (_: SocketException) {
                    break
                }
                if (packet.length != UDP_DISCOVERY_REPLY.size ||
                    !responseBuffer.copyOfRange(0, packet.length).contentEquals(UDP_DISCOVERY_REPLY)) continue
                val source = packet.address as? Inet4Address ?: continue
                val host = source.hostAddress ?: continue
                if (!isUsableLanIpv4(source) || !seenHosts.add(host)) continue
                if (udpGeneration.get() != generation || Thread.currentThread().isInterrupted) break

                val address = "$host:$DEFAULT_PORT"
                sendEvent("onDeviceFound", mapOf(
                    "id" to "udp:$host",
                    "name" to "Compas Remote Control",
                    "host" to host,
                    "port" to DEFAULT_PORT,
                    "address" to address,
                    "apiVersion" to "1",
                ))
            }
        } catch (_: Exception) {
            // UDP fallback is best-effort; DNS-SD discovery remains active.
        } finally {
            socket.close()
            clearUdpWorker(generation, socket)
        }
    }

    private fun isUsableLanIpv4(address: Inet4Address): Boolean {
        if (address.isAnyLocalAddress || address.isLoopbackAddress || address.isMulticastAddress) return false
        val bytes = address.address.map { it.toInt() and 0xff }
        return bytes[0] == 10 ||
            (bytes[0] == 172 && bytes[1] in 16..31) ||
            (bytes[0] == 192 && bytes[1] == 168) ||
            (bytes[0] == 169 && bytes[1] == 254)
    }

    private fun clearUdpWorker(generation: Long, socket: DatagramSocket?) {
        synchronized(udpLifecycleLock) {
            if (udpGeneration.get() == generation && (socket == null || udpSocket === socket)) {
                udpSocket = null
                udpWorker = null
            }
        }
    }

    private fun stopUdpFallback() {
        synchronized(udpLifecycleLock) {
            udpGeneration.incrementAndGet()
            udpSocket?.close()
            udpSocket = null
            udpWorker?.interrupt()
            udpWorker = null
        }
    }
}
