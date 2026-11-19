package com.compas.remote.mediasession

import java.util.concurrent.Executor
import java.util.concurrent.FutureTask

/** The current artwork and any in-flight decode are owned by the main thread. */
internal class MediaArtworkCache<T>(
    private val executor: Executor,
    private val decode: (String) -> T?,
    private val postResult: (() -> Unit) -> Unit,
    private val scheduleRetry: (Runnable) -> Unit,
    private val cancelRetry: (Runnable) -> Unit,
    private val onDecoded: () -> Unit
) {
    var bitmap: T? = null
        private set

    private var identity: String? = null
    private var generation = 0
    private var pending: FutureTask<Unit>? = null
    private var retry: Runnable? = null

    fun load(uri: String?) {
        if (identity == uri) return
        identity = uri
        val request = ++generation
        pending?.cancel(false)
        pending = null
        retry?.let(cancelRetry)
        retry = null
        bitmap = null
        if (uri == null) return
        startDecode(uri, request, canRetry = true)
    }

    private fun startDecode(uri: String, request: Int, canRetry: Boolean) {
        val task = FutureTask<Unit>({
            val decoded = runCatching { decode(uri) }.getOrNull()
            postResult {
                if (generation == request) {
                    pending = null
                    bitmap = decoded
                    if (decoded != null) onDecoded()
                    else if (canRetry) queueRetry(uri, request)
                }
            }
        }, Unit)
        pending = task
        executor.execute(task)
    }

    private fun queueRetry(uri: String, request: Int) {
        val callback = Runnable {
            if (generation == request) {
                retry = null
                startDecode(uri, request, canRetry = false)
            }
        }
        retry = callback
        scheduleRetry(callback)
    }
}
