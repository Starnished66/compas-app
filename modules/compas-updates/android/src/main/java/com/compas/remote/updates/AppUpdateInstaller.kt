package com.compas.remote.updates

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.SystemClock
import androidx.core.content.FileProvider
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.HttpURLConnection
import java.net.URI
import java.security.MessageDigest

/** No worker, network traffic or cache scans exist until the user requests an install. */
internal object AppUpdateInstaller {
    const val MAX_APK_BYTES = 256L * 1024L * 1024L
    private const val TOTAL_TIMEOUT_MS = 5L * 60L * 1000L
    private val releaseVersion = "[0-9]+\\.[0-9]+\\.[0-9]+(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?"
    private val downloadPath = Regex("/Starnished66/compas-app/releases/download/v($releaseVersion)/compas-($releaseVersion)\\.apk")
    private val redirectHosts = setOf("github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com")

    /** React Native's fetch has no streaming body reader on Android. Bound the
     * manifest before it crosses the native/JS boundary, including chunked bodies. */
    fun fetchManifest(channel: String): Map<String, Any> {
        require(channel == "stable" || channel == "beta") { "Invalid application update channel" }
        val deadline = SystemClock.elapsedRealtime() + 10_000L
        val releasePath = if (channel == "beta") "download/updates-beta" else "latest/download"
        val connection = connect("https://github.com/Starnished66/compas-app/releases/$releasePath/android-update.json", deadline, 10_000)
        try {
            val status = connection.responseCode
            if (status == 404) return mapOf("status" to status, "body" to "")
            check(status == 200) { "Application update check failed (HTTP $status)" }
            check(connection.contentLengthLong <= 16 * 1024) { "Application update manifest is too large" }
            val bytes = ByteArrayOutputStream()
            connection.inputStream.use { input ->
                val buffer = ByteArray(4096)
                while (true) {
                    check(SystemClock.elapsedRealtime() < deadline) { "Application update check timed out" }
                    connection.readTimeout = (deadline - SystemClock.elapsedRealtime()).coerceIn(1, 10_000).toInt()
                    val count = input.read(buffer)
                    if (count < 0) break
                    check(bytes.size() + count <= 16 * 1024) { "Application update manifest is too large" }
                    bytes.write(buffer, 0, count)
                }
            }
            return mapOf("status" to status, "body" to bytes.toString("UTF-8"))
        } finally { connection.disconnect() }
    }

    private fun connect(url: String, deadline: Long, timeoutMs: Int): HttpURLConnection {
        var next = URI(url)
        for (redirect in 0..5) {
            check(SystemClock.elapsedRealtime() < deadline) { "Application download timed out" }
            require(next.scheme == "https" && next.host in redirectHosts && next.port == -1 && next.rawUserInfo == null && next.rawFragment == null) { "Untrusted application download redirect" }
            val connection = next.toURL().openConnection() as HttpURLConnection
            connection.instanceFollowRedirects = false
            connection.connectTimeout = minOf(timeoutMs, (deadline - SystemClock.elapsedRealtime()).coerceAtLeast(1).toInt())
            connection.readTimeout = connection.connectTimeout
            connection.setRequestProperty("Accept-Encoding", "identity")
            try {
                if (connection.responseCode !in listOf(301, 302, 303, 307, 308)) return connection
                check(redirect < 5) { "Too many application download redirects" }
                next = next.resolve(connection.getHeaderField("Location") ?: error("Missing application redirect"))
            } catch (error: Exception) { connection.disconnect(); throw error }
            connection.disconnect()
        }
        error("Too many application download redirects")
    }

    internal fun validateRequest(url: String, hash: String, versionCode: Long, size: Long) {
        require(url.length <= 512) { "Invalid application update URL" }
        val uri = URI(url)
        val path = downloadPath.matchEntire(uri.path.orEmpty())
        require(uri.scheme == "https" && uri.host == "github.com" && uri.port == -1 &&
            uri.rawUserInfo == null && uri.rawQuery == null && uri.rawFragment == null &&
            uri.rawPath == uri.path && path != null && path.groupValues[1] == path.groupValues[2]) { "Invalid application update URL" }
        require(hash.matches(Regex("[0-9a-f]{64}"))) { "Invalid application checksum" }
        require(versionCode in 1..Int.MAX_VALUE.toLong() && size in 1..MAX_APK_BYTES) { "Invalid application update metadata" }
    }

    fun prepare(context: Context, url: String, hash: String, versionCode: Long, size: Long): File {
        validateRequest(url, hash, versionCode, size)
        val installed = context.packageManager.getPackageInfo(context.packageName, PackageManager.GET_SIGNING_CERTIFICATES)
        require(versionCode > installed.longVersionCode) { "This application update is already installed" }
        val directory = File(context.cacheDir, "app-updates")
        check(directory.isDirectory || directory.mkdirs()) { "Cannot create application update cache" }
        // Keep a verified APK immutable while the system installer may be reading it. Two
        // requests retain at most twice the maximum APK size; stale files are cleaned on demand.
        val target = File(directory, "$hash.apk")
        val others = directory.listFiles().orEmpty().filter { it != target }
        for (file in others) {
            if (file.name.endsWith(".part") || System.currentTimeMillis() - file.lastModified() > 24L * 60L * 60L * 1000L) file.delete()
        }
        if (!target.isFile) {
            val retained = directory.listFiles().orEmpty().sumOf { it.length() }
            check(retained + size <= 2L * MAX_APK_BYTES) { "Application update cache is full; clear the app cache and retry" }
            check(directory.usableSpace > size + 16L * 1024L * 1024L) { "Not enough storage for this application update" }
            val partial = File(directory, "$hash.part")
            try {
                download(url, partial, size)
                verify(context, partial, hash, versionCode, size)
                check(partial.renameTo(target)) { "Cannot save verified application update" }
            } finally {
                partial.delete()
            }
        } else {
            try { verify(context, target, hash, versionCode, size) }
            catch (error: Exception) { target.delete(); throw error }
        }
        return target
    }

    private fun download(url: String, destination: File, expectedSize: Long) {
        val deadline = SystemClock.elapsedRealtime() + TOTAL_TIMEOUT_MS
        val connection = connect(url, deadline, 15_000)
        try {
            val status = connection.responseCode
            check(status == 200) { "Application download failed (HTTP $status)" }
            val length = connection.contentLengthLong
            check(length == -1L || length == expectedSize) { "Unexpected application download size" }
            var total = 0L
            connection.inputStream.use { input ->
                destination.outputStream().use { output ->
                    val buffer = ByteArray(32 * 1024)
                    while (true) {
                        check(SystemClock.elapsedRealtime() < deadline) { "Application download timed out" }
                        connection.readTimeout = (deadline - SystemClock.elapsedRealtime()).coerceIn(1, 15_000).toInt()
                        val count = input.read(buffer)
                        if (count < 0) break
                        total += count
                        check(total <= expectedSize) { "Application download exceeded its expected size" }
                        output.write(buffer, 0, count)
                    }
                }
            }
            check(total == expectedSize) { "Incomplete application download" }
            return
        } finally { connection.disconnect() }
    }

    internal fun verify(context: Context, file: File, hash: String, versionCode: Long, size: Long) {
        check(file.length() == size) { "Application update size mismatch" }
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buffer = ByteArray(32 * 1024)
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                digest.update(buffer, 0, count)
            }
        }
        check(digest.digest().joinToString("") { "%02x".format(it) } == hash) { "Application update checksum mismatch" }
        val manager = context.packageManager
        val candidate = manager.getPackageArchiveInfo(file.path, PackageManager.GET_SIGNING_CERTIFICATES)
            ?: error("Invalid application package")
        val installed = manager.getPackageInfo(context.packageName, PackageManager.GET_SIGNING_CERTIFICATES)
        check(candidate.packageName == context.packageName && candidate.longVersionCode == versionCode &&
            versionCode > installed.longVersionCode) { "Application update identity or version mismatch" }
        check(candidate.applicationInfo?.minSdkVersion?.let { it <= Build.VERSION.SDK_INT } == true) { "Application update requires a newer Android version" }
        val candidateSigners = candidate.signingInfo?.apkContentsSigners.orEmpty().map { it.toByteArray().toList() }.toSet()
        val installedSigners = installed.signingInfo?.apkContentsSigners.orEmpty().map { it.toByteArray().toList() }.toSet()
        // Deliberately require the current signing identity; key rotation needs an explicit
        // migration, never a change supplied only by an unauthenticated release manifest.
        check(candidateSigners.isNotEmpty() && candidateSigners == installedSigners) { "Application update signing certificate mismatch" }
    }

    fun openInstaller(context: Context, file: File) {
        check(context.packageManager.canRequestPackageInstalls()) { "Application installation permission is required" }
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.app-updates", file)
        context.startActivity(Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
        })
    }
}

class AppUpdateFileProvider : FileProvider()
