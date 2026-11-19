package com.compas.remote.mediasession

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.net.URL

internal fun decodeMediaArtwork(uri: String): Bitmap? = when {
    uri.startsWith("file://") || uri.startsWith("/") -> {
        val cleanPath = uri.removePrefix("file://")
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(cleanPath, bounds)
        BitmapFactory.decodeFile(cleanPath, sampledOptions(bounds))
    }
    uri.startsWith("http://") || uri.startsWith("https://") -> decodeRemoteArtwork(uri)
    else -> null
}

private fun decodeRemoteArtwork(uri: String): Bitmap? {
    val connection = URL(uri).openConnection().apply {
        connectTimeout = ARTWORK_TIMEOUT_MS
        readTimeout = ARTWORK_TIMEOUT_MS
    }
    val bytes = connection.getInputStream().use(::readBounded) ?: return null
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
    return BitmapFactory.decodeByteArray(bytes, 0, bytes.size, sampledOptions(bounds))
}

// Full-resolution cover art (3000x3000 is ~36 MB) can OOM; the notification needs ~512 px.
private fun sampledOptions(bounds: BitmapFactory.Options): BitmapFactory.Options {
    var sample = 1
    val largest = maxOf(bounds.outWidth, bounds.outHeight)
    while (largest / (sample * 2) >= ARTWORK_TARGET_PX) sample *= 2
    return BitmapFactory.Options().apply { inSampleSize = sample }
}

/** Reads at most ARTWORK_MAX_BYTES; returns null for larger bodies instead of buffering them. */
private fun readBounded(stream: InputStream): ByteArray? {
    val out = ByteArrayOutputStream()
    val buffer = ByteArray(16 * 1024)
    while (true) {
        val read = stream.read(buffer)
        if (read < 0) break
        if (out.size() + read > ARTWORK_MAX_BYTES) return null
        out.write(buffer, 0, read)
    }
    return out.toByteArray()
}

private const val ARTWORK_TIMEOUT_MS = 5000
private const val ARTWORK_TARGET_PX = 512
private const val ARTWORK_MAX_BYTES = 8 * 1024 * 1024
