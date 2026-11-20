package com.compas.remote.bluetooth

import android.bluetooth.BluetoothSocket
import android.util.Base64
import java.io.BufferedInputStream
import java.io.ByteArrayOutputStream
import java.io.EOFException
import java.io.IOException
import java.io.InputStream
import java.nio.charset.StandardCharsets
import java.util.concurrent.ScheduledThreadPoolExecutor
import java.util.concurrent.TimeUnit

internal data class RfcommHttpRequest(
    val method: String,
    val target: String,
    val headers: Map<String, String>?,
    val bodyBase64: String?,
)

internal data class ParsedResponse(
    val statusCode: Int,
    val reason: String,
    val headers: Map<String, String>,
    val body: ByteArray
)

private val responseTimeoutExecutor = ScheduledThreadPoolExecutor(1) { task ->
    Thread(task, "compas-rfcomm-response-timeout").apply { isDaemon = true }
}.apply {
    removeOnCancelPolicy = true
}

internal fun exchangeHttp(
    activeSocket: BluetoothSocket,
    request: RfcommHttpRequest,
    artwork: Boolean,
    onResponse: (Map<String, Any>) -> Unit,
) {
    val (method, target, headers, bodyBase64) = request
    // RFCOMM has no read timeout. Close the socket if the player never
    // answers so the JS connection attempt can fail instead of hanging.
    val responseTimeoutMs = if (bodyBase64 != null) 30_000L else if (artwork) 20_000L else 5_000L
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
        onResponse(mapOf(
            "statusCode" to response.statusCode,
            "reason" to response.reason,
            "headers" to response.headers,
            "bodyBase64" to base64Body
        ))
    } finally {
        responseTimeout.cancel(false)
    }
}

internal fun parseHttpResponse(rawInput: InputStream): ParsedResponse {
    val input = if (rawInput is BufferedInputStream) rawInput else BufferedInputStream(rawInput)
    val raw = readHttpHeaders(input)
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

private fun readHttpHeaders(input: InputStream): String {
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
    return String(headerBytes.toByteArray(), StandardCharsets.ISO_8859_1)
}
