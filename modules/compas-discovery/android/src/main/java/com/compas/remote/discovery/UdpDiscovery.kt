package com.compas.remote.discovery

import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.Inet4Address
import java.net.InetAddress
import java.net.SocketException
import java.net.SocketTimeoutException
import java.nio.charset.StandardCharsets
import java.util.concurrent.atomic.AtomicLong

private const val DEFAULT_PORT = 8899
private const val UDP_DISCOVERY_PORT = 8899
private const val UDP_DISCOVERY_REQUEST_SIZE = 32
private const val UDP_DISCOVERY_WINDOW_MS = 4_000L
private const val UDP_DISCOVERY_INTERVAL_MS = 1_000L
private val UDP_DISCOVERY_REQUEST = ByteArray(UDP_DISCOVERY_REQUEST_SIZE).also {
    "COMPAS_REMOTE_DISCOVER_V1".toByteArray(StandardCharsets.US_ASCII).copyInto(it)
}
private val UDP_DISCOVERY_REPLY = "COMPAS_REMOTE_V1 8899\n".toByteArray(StandardCharsets.US_ASCII)

internal class UdpDiscovery(private val sendEvent: (String, Map<String, Any?>) -> Unit) {
    private val udpGeneration = AtomicLong(0)
    private val udpLifecycleLock = Any()
    @Volatile private var udpSocket: DatagramSocket? = null
    @Volatile private var udpWorker: Thread? = null

    fun restart(scanId: Double) {
        stop()
        synchronized(udpLifecycleLock) {
            val generation = udpGeneration.incrementAndGet()
            val worker = Thread({ runUdpFallback(generation, scanId) }, "compas-udp-discovery").apply {
                isDaemon = true
            }
            udpWorker = worker
            worker.start()
        }
    }

    private fun runUdpFallback(generation: Long, scanId: Double) {
        val socket = openSocket(generation) ?: return
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
                    "scanId" to scanId,
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

    private fun openSocket(generation: Long): DatagramSocket? {
        val socket = try {
            DatagramSocket().apply {
                soTimeout = 200
                broadcast = true
            }
        } catch (_: Exception) {
            clearUdpWorker(generation, null)
            return null
        }
        synchronized(udpLifecycleLock) {
            if (udpGeneration.get() != generation) {
                socket.close()
                return null
            }
            udpSocket = socket
        }
        return socket
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

    fun stop() {
        synchronized(udpLifecycleLock) {
            udpGeneration.incrementAndGet()
            udpSocket?.close()
            udpSocket = null
            udpWorker?.interrupt()
            udpWorker = null
        }
    }
}
