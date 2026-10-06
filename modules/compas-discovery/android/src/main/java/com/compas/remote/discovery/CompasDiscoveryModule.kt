package com.compas.remote.discovery

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.nio.charset.StandardCharsets
import java.util.concurrent.ConcurrentHashMap

private const val SERVICE_TYPE = "_compas-remote._tcp."
private const val DEFAULT_PORT = 8899

class CompasDiscoveryModule : Module() {
    private val context: Context
        get() = appContext.reactContext ?: throw IllegalStateException("React context is unavailable")

    private var nsdManager: NsdManager? = null
    private var discoveryListener: NsdManager.DiscoveryListener? = null
    private var multicastLock: WifiManager.MulticastLock? = null
    private val resolvingServices = ConcurrentHashMap.newKeySet<String>()

    override fun definition() = ModuleDefinition {
        Name("CompasDiscovery")

        Events("onDeviceFound", "onDeviceLost", "onDiscoveryStarted", "onDiscoveryStopped", "onDiscoveryError")

        AsyncFunction("startDiscovery") { promise: Promise ->
            try {
                if (discoveryListener != null) {
                    promise.resolve(true)
                    return@AsyncFunction
                }

                val manager = context.getSystemService(NsdManager::class.java)
                if (manager == null) {
                    promise.reject("NSD_UNAVAILABLE", "NsdManager not available on this device", null)
                    return@AsyncFunction
                }
                nsdManager = manager

                val wifi = context.applicationContext.getSystemService(WifiManager::class.java)
                wifi?.createMulticastLock("compas-remote-nsd")?.let { lock ->
                    lock.setReferenceCounted(false)
                    lock.acquire()
                    multicastLock = lock
                }

                val listener = object : NsdManager.DiscoveryListener {
                    override fun onDiscoveryStarted(serviceType: String) {
                        sendEvent("onDiscoveryStarted", mapOf("serviceType" to serviceType))
                    }

                    override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
                        sendEvent("onDiscoveryError", mapOf("errorCode" to errorCode, "phase" to "start"))
                        stopInternal()
                    }

                    override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {
                        sendEvent("onDiscoveryError", mapOf("errorCode" to errorCode, "phase" to "stop"))
                        stopInternal()
                    }

                    override fun onDiscoveryStopped(serviceType: String) {
                        sendEvent("onDiscoveryStopped", mapOf("serviceType" to serviceType))
                    }

                    override fun onServiceFound(serviceInfo: NsdServiceInfo) {
                        val serviceType = serviceInfo.serviceType.trimEnd('.')
                        val expected = SERVICE_TYPE.trimEnd('.')
                        if (serviceType != expected) return
                        val name = serviceInfo.serviceName ?: return
                        if (!resolvingServices.add(name)) return

                        try {
                            manager.resolveService(serviceInfo, object : NsdManager.ResolveListener {
                                override fun onResolveFailed(info: NsdServiceInfo, errorCode: Int) {
                                    resolvingServices.remove(name)
                                }

                                override fun onServiceResolved(info: NsdServiceInfo) {
                                    resolvingServices.remove(name)
                                    val host = info.host?.hostAddress ?: return
                                    val port = info.port

                                    val apiAttr = info.attributes?.get("api")?.let { String(it, StandardCharsets.UTF_8) }
                                    val endpointHost = if (host.contains(':')) "[$host]" else host
                                    val address = "$endpointHost:$port"

                                    sendEvent("onDeviceFound", mapOf(
                                        "id" to info.serviceName,
                                        "name" to info.serviceName,
                                        "host" to host,
                                        "port" to port,
                                        "address" to address,
                                        "apiVersion" to (apiAttr ?: "1")
                                    ))
                                }
                            })
                        } catch (e: Exception) {
                            resolvingServices.remove(name)
                        }
                    }

                    override fun onServiceLost(serviceInfo: NsdServiceInfo) {
                        sendEvent("onDeviceLost", mapOf(
                            "id" to serviceInfo.serviceName,
                            "name" to serviceInfo.serviceName
                        ))
                    }
                }

                discoveryListener = listener
                manager.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, listener)
                promise.resolve(true)
            } catch (e: Exception) {
                stopInternal()
                promise.reject("DISCOVERY_FAILED", e.message, e)
            }
        }

        AsyncFunction("stopDiscovery") { promise: Promise ->
            try {
                stopInternal()
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("STOP_FAILED", e.message, e)
            }
        }

        OnDestroy {
            stopInternal()
        }
    }

    private fun stopInternal() {
        val listener = discoveryListener
        discoveryListener = null
        if (listener != null && nsdManager != null) {
            runCatching { nsdManager?.stopServiceDiscovery(listener) }
        }
        resolvingServices.clear()
        multicastLock?.let { lock ->
            if (lock.isHeld) {
                runCatching { lock.release() }
            }
        }
        multicastLock = null
    }
}
