package com.compas.remote.files

import android.content.Context
import com.facebook.react.modules.network.OkHttpClientProvider
import expo.modules.kotlin.exception.CodedException
import java.io.File
import java.io.IOException
import java.io.InputStream
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
private class TransferDestinationException(cause: Exception) :
    CodedException("ERR_TRANSFER_DESTINATION", cause.message ?: "Could not write download", cause)

private inline fun <T> writeDestination(write: () -> T): T {
    try {
        return write()
    } catch (error: IOException) {
        throw TransferDestinationException(error)
    } catch (error: SecurityException) {
        throw TransferDestinationException(error)
    }
}

/** Creates [file], or the first free "name (n).ext" beside it, without ever replacing an existing file. */
private fun reserveNewFile(file: File): File {
    val dir = file.parentFile ?: throw TransferDestinationException(IOException("Invalid destination"))
    val dot = file.name.lastIndexOf('.')
    val stem = if (dot > 0) file.name.substring(0, dot) else file.name
    val ext = if (dot > 0) file.name.substring(dot) else ""
    for (i in 0 until 1000) {
        val candidate = if (i == 0) file else File(dir, "$stem ($i)$ext")
        if (writeDestination { candidate.createNewFile() }) return candidate
    }
    throw TransferDestinationException(IOException("No free file name in ${dir.name}"))
}

/** Writes [input] to [file] (replaced) or, when [exclusive], to a newly created file; returns the file written. */
private fun saveDownload(
    input: InputStream,
    file: File,
    total: Long = -1L,
    onProgress: ((received: Long, total: Long) -> Unit)? = null,
    exclusive: Boolean = false,
): File {
    val target = if (exclusive) reserveNewFile(file) else file
    val output = try {
        writeDestination { target.outputStream() }
    } catch (error: Throwable) {
        if (exclusive) runCatching { target.delete() }
        throw error
    }
    var received = 0L
    var lastEmit = 0L
    try {
        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
        while (true) {
            val count = input.read(buffer)
            if (count < 0) break
            writeDestination { output.write(buffer, 0, count) }
            received += count
            if (onProgress != null) {
                val now = System.currentTimeMillis()
                if ((total > 0 && received >= total) || now - lastEmit >= PROGRESS_INTERVAL_MS) {
                    lastEmit = now
                    onProgress(received, if (total > 0) total else received)
                }
            }
        }
        // A storage error can surface on close too; the half-written file goes with it.
        writeDestination { output.close() }
    } catch (error: Throwable) {
        runCatching { output.close() }
        runCatching { target.delete() }
        throw error
    }
    if (onProgress != null) onProgress(received, if (total > 0) total else received)
    return target
}

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
    ) = download(taskId, url, file, headers, null, done)

    /**
     * Saves a 2xx body to [file], reporting download progress; any other status returns its body as text.
     * With [exclusive] an existing file is never replaced: the body goes to the next free name, passed to [onSaved].
     */
    fun download(
        taskId: String, url: String, file: File, headers: Map<String, String>,
        onProgress: ((received: Long, total: Long) -> Unit)?,
        done: (Result<Triple<Int, Map<String, String>, String>>) -> Unit,
        exclusive: Boolean = false,
        onSaved: ((File) -> Unit)? = null,
    ) {
        val request = Request.Builder().url(url).apply { headers.forEach { (n, v) -> addHeader(n, v) } }.build()
        start(taskId, request, { response ->
            val responseHeaders = response.headers.toMultimap().mapValues { it.value.firstOrNull() ?: "" }
            if (response.isSuccessful) {
                val body = response.body
                val total = body?.contentLength() ?: -1L
                body?.byteStream()?.use { input ->
                    val saved = saveDownload(input, file, total, onProgress, exclusive)
                    onSaved?.invoke(saved)
                }
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
                    Result.failure(
                        if (call.isCanceled()) TransferCancelledException()
                        else e as? TransferDestinationException ?: TransferException(e.message ?: "Transfer failed")
                    )
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
