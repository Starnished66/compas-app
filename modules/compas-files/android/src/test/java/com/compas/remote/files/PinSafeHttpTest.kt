package com.compas.remote.files

import java.io.File
import java.net.InetAddress
import java.net.ServerSocket
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import okhttp3.OkHttpClient
import okhttp3.Request
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/** Minimal one-request-per-connection HTTP server; the JDK HttpServer is not on the Android unit-test classpath. */
private class FakeServer(private val respond: (path: String) -> Triple<Int, String?, String>) : AutoCloseable {
    val pinsSeen = CopyOnWriteArrayList<String?>()
    private val socket = ServerSocket(0, 50, InetAddress.getByName("127.0.0.1"))
    private val thread = Thread {
        while (!socket.isClosed) {
            try {
                socket.accept().use { client -> serve(client) }
            } catch (_: Exception) {
            }
        }
    }.apply { isDaemon = true; start() }

    private fun serve(client: java.net.Socket) {
        val input = client.getInputStream()
        fun line(): String {
            val sb = StringBuilder()
            while (true) {
                val c = input.read()
                if (c < 0 || c == '\n'.code) break
                if (c != '\r'.code) sb.append(c.toChar())
            }
            return sb.toString()
        }
        val path = line().split(" ")[1].substringBefore("?")
        var pin: String? = null
        var length = 0
        while (true) {
            val header = line()
            if (header.isEmpty()) break
            val name = header.substringBefore(":").trim()
            val value = header.substringAfter(":").trim()
            if (name.equals(PIN_HEADER, true)) pin = value
            if (name.equals("Content-Length", true)) length = value.toInt()
        }
        input.readNBytes(length)
        pinsSeen.add(pin)
        val (code, location, body) = respond(path)
        val bytes = body.toByteArray()
        val head = "HTTP/1.1 $code X\r\n" + (if (location != null) "Location: $location\r\n" else "") +
            "Content-Length: ${bytes.size}\r\nConnection: close\r\n\r\n"
        client.getOutputStream().apply { write(head.toByteArray()); write(bytes); flush() }
    }

    fun url(path: String) = "http://127.0.0.1:${socket.localPort}$path"
    override fun close() = socket.close()
}

private fun <T> await(start: ((Result<T>) -> Unit) -> Unit): Result<T> {
    val latch = CountDownLatch(1)
    var out: Result<T>? = null
    start { out = it; latch.countDown() }
    assertTrue("transfer did not finish", latch.await(10, TimeUnit.SECONDS))
    return out!!
}

class PinSafeHttpTest {
    private val fakePin = "000000-fake"

    private fun tempFile(text: String = "data") = File.createTempFile("transfer", ".bin").apply { writeText(text); deleteOnExit() }

    @Test
    fun uploadRedirectIsReturnedWithoutLocationAndPinNeverReachesTheTarget() {
        FakeServer { _ -> Triple(201, null, "") }.use { elsewhere ->
            FakeServer { _ -> Triple(302, elsewhere.url("/steal"), "") }.use { player ->
                val result = await<Pair<Int, String>> { done ->
                    PinSafeTransfers().upload("t1", player.url("/up"), tempFile(), mapOf(PIN_HEADER to fakePin), { _, _ -> }, done)
                }
                assertEquals(302, result.getOrThrow().first)
                assertEquals(0, elsewhere.pinsSeen.size)
                assertEquals(1, player.pinsSeen.size)
            }
        }
    }

    @Test
    fun downloadRedirectIsReturnedAndPinNeverReachesTheTarget() {
        FakeServer { _ -> Triple(200, null, "x") }.use { elsewhere ->
            FakeServer { _ -> Triple(307, elsewhere.url("/x"), "") }.use { player ->
                val result = await<Triple<Int, Map<String, String>, String>> { done ->
                    PinSafeTransfers().download("t2", player.url("/art"), tempFile(), mapOf(PIN_HEADER to fakePin), done)
                }
                assertEquals(307, result.getOrThrow().first)
                assertEquals(0, elsewhere.pinsSeen.size)
            }
        }
    }

    @Test
    fun plainUploadStillWorksSendsPinToThePlayerAndReportsFinalProgress() {
        FakeServer { _ -> Triple(201, null, "{\"ok\":true}") }.use { player ->
            var lastSent = 0L
            val result = await<Pair<Int, String>> { done ->
                PinSafeTransfers().upload("t3", player.url("/up"), tempFile(), mapOf(PIN_HEADER to fakePin), { sent, _ -> lastSent = sent }, done)
            }
            assertEquals(201 to "{\"ok\":true}", result.getOrThrow())
            assertEquals(4L, lastSent)
            assertEquals(listOf<String?>(fakePin), player.pinsSeen.toList())
        }
    }

    @Test
    fun startingATransferDoesNotBlockTheCaller() {
        val gate = CountDownLatch(1)
        FakeServer { _ -> gate.await(10, TimeUnit.SECONDS); Triple(201, null, "") }.use { player ->
            val started = System.nanoTime()
            val latch = CountDownLatch(1)
            val transfers = PinSafeTransfers()
            transfers.upload("t4", player.url("/up"), tempFile(), emptyMap(), { _, _ -> }) { latch.countDown() }
            assertTrue("upload() must return while the request is still in flight", System.nanoTime() - started < TimeUnit.SECONDS.toNanos(2))
            assertEquals(1L, latch.count)
            gate.countDown()
            assertTrue(latch.await(10, TimeUnit.SECONDS))
        }
    }

    @Test
    fun cancelBeforeTheCallIsRegisteredStillStopsTheUpload() {
        FakeServer { _ -> Triple(201, null, "") }.use { player ->
            val transfers = PinSafeTransfers()
            transfers.cancel("t5")
            val result = await<Pair<Int, String>> { done ->
                transfers.upload("t5", player.url("/up"), tempFile(), emptyMap(), { _, _ -> }, done)
            }
            assertTrue(result.exceptionOrNull() is TransferCancelledException)
        }
    }

    @Test
    fun connectionFailureKeepsTheOriginalMessage() {
        val port = java.net.ServerSocket(0).use { it.localPort }
        val result = await<Pair<Int, String>> { done ->
            PinSafeTransfers().upload("t6", "http://127.0.0.1:$port/up", tempFile(), emptyMap(), { _, _ -> }, done)
        }
        val error = result.exceptionOrNull() as TransferException
        assertEquals("ERR_TRANSFER", error.code)
        assertTrue(error.message!!.contains("Failed to connect", ignoreCase = true))
    }

    @Test
    fun sharedClientReturnsPinRedirectsWithoutLocationButFollowsOthers() {
        FakeServer { path -> if (path == "/next") Triple(200, null, "ok") else Triple(302, "/next", "") }.use { server ->
            val client = OkHttpClient.Builder().addNetworkInterceptor(refusePinRedirects).build()
            val plain = client.newCall(Request.Builder().url(server.url("/")).build()).execute()
            assertTrue(plain.use { it.isSuccessful })
            val pinned = client.newCall(Request.Builder().url(server.url("/")).header(PIN_HEADER, fakePin).build()).execute()
            pinned.use {
                assertEquals(302, it.code)
                assertNull(it.header("Location"))
            }
            assertEquals(listOf<String?>(null, null, fakePin), server.pinsSeen.toList())
        }
    }
}
