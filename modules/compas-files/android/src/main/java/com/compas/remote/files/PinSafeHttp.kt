package com.compas.remote.files

import android.content.Context
import com.facebook.react.modules.network.OkHttpClientProvider
import expo.modules.kotlin.exception.CodedException
import java.io.File
import java.io.IOException
import java.util.concurrent.ConcurrentHashMap
import java.util.Collections
import java.util.concurrent.TimeUnit
import okhttp3.Call
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.Callback
import okhttp3.Response
import okhttp3.ResponseBody
import okio.Buffer
import okio.BufferedSink
import okio.BufferedSource
import okio.ForwardingSource
import okio.buffer

const val PIN_HEADER = "X-Compas-PIN"

/** Install before React Native creates its first NetworkingModule. Keep only the
 * application context; React reloads and lazy Expo module creation cannot remove guards.
 */
object PinSafeHttpInstaller {
    fun install(context: Context) {
        val application = context.applicationContext
        OkHttpClientProvider.setOkHttpClientFactory {
            OkHttpClientProvider.createClientBuilder(application)
                .addNetworkInterceptor(refusePinRedirects)
                .addInterceptor(boundManagementResponses)
                .build()
        }
    }
}

private const val API_RESPONSE_LIMIT = 1024L * 1024L

/** Bound settings/management replies before React Native buffers them. This is an
 * application interceptor so the limit also covers transparently inflated gzip bodies.
 * Artwork, music transfers and update downloads retain their own transfer paths.
 */
val boundManagementResponses = Interceptor { chain ->
    val response = chain.proceed(chain.request())
    val path = chain.request().url.encodedPath
    val bounded = listOf("settings", "plugin-store", "plugins", "player-layouts", "capabilities", "status")
        .any { path == "/api/v1/$it" || path.startsWith("/api/v1/$it/") }
    val body = response.body
    if (!bounded || body == null) response else {
        if (body.contentLength() > API_RESPONSE_LIMIT) {
            response.close()
            throw IOException("Player API response exceeds the size limit")
        }
        val source = object : ForwardingSource(body.source()) {
            private var consumed = 0L
            override fun read(sink: Buffer, byteCount: Long): Long {
                val count = super.read(sink, minOf(byteCount, API_RESPONSE_LIMIT - consumed + 1))
                if (count > 0) consumed += count
                if (consumed > API_RESPONSE_LIMIT) {
                    close()
                    throw IOException("Player API response exceeds the size limit")
                }
                return count
            }
        }.buffer()
        response.newBuilder().body(object : ResponseBody() {
            override fun contentType() = body.contentType()
            override fun contentLength() = body.contentLength()
            override fun source(): BufferedSource = source
        }).build()
    }
}

/**
 * Network interceptor: sees every hop. A redirect to a request that carries the PIN is handed back as the
 * 3xx response with its Location removed, so OkHttp has nowhere to follow it and the PIN never leaves the player.
 */
val refusePinRedirects = Interceptor { chain ->
    val request = chain.request()
    val response = chain.proceed(request)
    if (request.header(PIN_HEADER) != null && response.isRedirect) {
        response.newBuilder().removeHeader("Location").build()
    } else {
        response
    }
}

/** Client for PIN-carrying transfers: redirects are never followed; the 3xx is returned to the caller. */
fun pinSafeClient(base: OkHttpClient.Builder = OkHttpClient.Builder()): OkHttpClient =
    base.connectTimeout(60, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .followRedirects(false)
        .followSslRedirects(false)
        .addNetworkInterceptor(refusePinRedirects)
        .build()

/** The original OkHttp message is kept so the app can tell a dropped link from a refusal. */
class TransferException(message: String) : CodedException("ERR_TRANSFER", message, null)
class TransferCancelledException : CodedException("ERR_TRANSFER_CANCELLED", "Transfer cancelled", null)

private const val PROGRESS_INTERVAL_MS = 100L

/** Cancellable calls by the task id the JavaScript side chose. Nothing here blocks the caller's thread. */
class PinSafeTransfers(private val client: OkHttpClient = pinSafeClient()) {
    private val calls = ConcurrentHashMap<String, Call>()
    private val cancelled: MutableSet<String> = Collections.newSetFromMap(ConcurrentHashMap())

    fun cancel(taskId: String) {
        cancelled.add(taskId)
        calls[taskId]?.cancel()
    }

    /** Streams [file] as the raw request body; [done] gets status and body, or the failure. Never follows a redirect. */
    fun upload(
        taskId: String, url: String, file: File, headers: Map<String, String>,
        onProgress: (sent: Long, total: Long) -> Unit,
        done: (Result<Pair<Int, String>>) -> Unit,
    ) {
        val total = file.length()
        val body = object : RequestBody() {
            override fun contentType() = (headers["Content-Type"] ?: "application/octet-stream").toMediaTypeOrNull()
            override fun contentLength() = total
            override fun writeTo(sink: BufferedSink) {
                var sent = 0L
                var lastEmit = 0L
                file.inputStream().use { input ->
                    val buffer = ByteArray(64 * 1024)
                    while (true) {
                        val read = input.read(buffer)
                        if (read < 0) break
                        sink.write(buffer, 0, read)
                        sent += read
                        val now = System.currentTimeMillis()
                        if (sent == total || now - lastEmit >= PROGRESS_INTERVAL_MS) {
                            lastEmit = now
                            onProgress(sent, total)
                        }
                    }
                }
            }
        }
        val request = Request.Builder().url(url).headers(okhttp3.Headers.Builder().apply {
            headers.forEach { (name, value) -> if (!name.equals("Content-Type", true)) add(name, value) }
        }.build()).post(body).build()
        start(taskId, request, { response -> response.code to (response.body?.string() ?: "") }, done)
    }

    /** Saves a 2xx body to [file]; any other status returns its body as text and leaves [file] alone. */
    fun download(
        taskId: String, url: String, file: File, headers: Map<String, String>,
        done: (Result<Triple<Int, Map<String, String>, String>>) -> Unit,
    ) {
        val request = Request.Builder().url(url).apply { headers.forEach { (n, v) -> addHeader(n, v) } }.build()
        start(taskId, request, { response ->
            val responseHeaders = response.headers.toMultimap().mapValues { it.value.firstOrNull() ?: "" }
            if (response.isSuccessful) {
                response.body?.byteStream()?.use { input -> file.outputStream().use { input.copyTo(it) } }
                Triple(response.code, responseHeaders, "")
            } else {
                Triple(response.code, responseHeaders, response.body?.string() ?: "")
            }
        }, done)
    }

    private fun <T> start(taskId: String, request: Request, read: (Response) -> T, done: (Result<T>) -> Unit) {
        val call = client.newCall(request)
        calls[taskId] = call
        // A cancel that arrived before the call existed must still stop it.
        if (cancelled.contains(taskId)) call.cancel()
        call.enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                finish(taskId)
                done(Result.failure(if (call.isCanceled()) TransferCancelledException() else TransferException(e.message ?: "Transfer failed")))
            }

            override fun onResponse(call: Call, response: Response) {
                val result = try {
                    Result.success(response.use(read))
                } catch (e: Throwable) {
                    // Anything else (for example a SecurityException on the file) must not crash OkHttp's thread or leave the promise pending.
                    Result.failure(if (call.isCanceled()) TransferCancelledException() else TransferException(e.message ?: "Transfer failed"))
                }
                finish(taskId)
                done(result)
            }
        })
    }

    private fun finish(taskId: String) {
        calls.remove(taskId)
        cancelled.remove(taskId)
    }
}
