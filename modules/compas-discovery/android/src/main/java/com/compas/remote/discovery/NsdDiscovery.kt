package com.compas.remote.discovery

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import java.nio.charset.StandardCharsets
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong

private const val SERVICE_TYPE = "_compas-remote._tcp."
private const val RESOLVE_RETRY_DELAY_MS = 300L
private const val RESOLVE_MAX_RETRIES = 5

internal class NsdDiscovery(private val context: () -> Context, private val sendEvent: (String, Map<String, Any?>) -> Unit) {
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
    private val nsdGeneration = AtomicLong(0)
    private val nsdLifecycleLock = Any()

    fun stop() {
        synchronized(nsdLifecycleLock) {
            nsdGeneration.incrementAndGet()
            clearNsdDiscoveryLocked()
        }
    }

    fun start(scanId: Double) {
        synchronized(nsdLifecycleLock) {
            if (discoveryListener != null) return
            val manager = context().getSystemService(NsdManager::class.java)
            if (manager == null) {
                sendEvent("onDiscoveryError", mapOf("errorCode" to -1, "phase" to "start"))
                return
            }
            val wifi = context().applicationContext.getSystemService(WifiManager::class.java)
            nsdManager = manager
            val generation = nsdGeneration.incrementAndGet()
            try {
                wifi?.createMulticastLock("compas-remote-nsd")?.let { lock ->
                    lock.setReferenceCounted(false)
                    lock.acquire()
                    multicastLock = lock
                }
                val listener = createNsdListener(manager, generation, scanId)
                discoveryListener = listener
                manager.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, listener)
            } catch (_: Exception) {
                failNsdDiscoveryLocked(generation, -1, "start")
            }
        }
    }

    private fun createNsdListener(manager: NsdManager, generation: Long, scanId: Double) = object : NsdManager.DiscoveryListener {
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
                pumpResolveQueueLocked(manager, generation, scanId)
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
                        "scanId" to scanId,
                        "id" to serviceInfo.serviceName,
                        "name" to serviceInfo.serviceName
                    ))
                }
            }
        }
    }

    private fun pumpResolveQueueLocked(manager: NsdManager, generation: Long, scanId: Double) {
        if (generation != nsdGeneration.get()) return
        while (resolveInFlightName == null) {
            val next = resolveQueue.removeFirstOrNull() ?: return
            val name = next.serviceName ?: continue
            val listener = ResolveListener(manager, generation, scanId, name)
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

    private inner class ResolveListener(
        private val manager: NsdManager,
        private val generation: Long,
        private val scanId: Double,
        private val serviceName: String,
    ) : NsdManager.ResolveListener {
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
                                pumpResolveQueueLocked(manager, generation, scanId)
                            }
                        }
                    }, RESOLVE_RETRY_DELAY_MS)
                } else {
                    resolvingServices.remove(serviceName)
                    resolveRetries.remove(serviceName)
                }
                pumpResolveQueueLocked(manager, generation, scanId)
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
                        "scanId" to scanId,
                        "id" to info.serviceName,
                        "name" to info.serviceName,
                        "host" to host,
                        "hostname" to hostname,
                        "port" to port,
                        "address" to address,
                        "apiVersion" to (apiAttr ?: "1")
                    ))
                }
                pumpResolveQueueLocked(manager, generation, scanId)
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
}
