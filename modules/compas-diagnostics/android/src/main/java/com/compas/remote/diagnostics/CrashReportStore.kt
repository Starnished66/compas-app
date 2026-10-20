package com.compas.remote.diagnostics

import android.content.Context
import android.os.Build
import android.util.AtomicFile
import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.charset.StandardCharsets
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID

internal data class PendingCrashReport(val id: String, val text: String)

internal object CrashReportStore {
  private const val FILE_NAME = "pending-crash-report.txt"
  private const val MAX_BYTES = 64 * 1024
  private const val MAX_ERROR_MESSAGE = 8 * 1024

  @Synchronized
  fun writeJavaScript(context: Context, message: String, stack: String, fatal: Boolean): Boolean {
    if (!fatal) return false
    return write(context, "JavaScript fatal", message.take(MAX_ERROR_MESSAGE), stack.take(CrashReportSanitizer.MAX_DETAILS))
  }

  @Synchronized
  fun writeNative(context: Context, threadName: String, throwable: Throwable) {
    runCatching {
      val details = buildString {
        var current: Throwable? = throwable
        val seen = java.util.Collections.newSetFromMap(java.util.IdentityHashMap<Throwable, Boolean>())
        var depth = 0
        while (current != null && depth < 4 && seen.add(current)) {
          if (depth > 0) append("Caused by: ")
          append(current.javaClass.name.take(512)).append(": ")
          append(current.message.orEmpty().take(MAX_ERROR_MESSAGE)).append('\n')
          current.stackTrace.take(if (depth == 0) 120 else 40).forEach {
            if (length < CrashReportSanitizer.MAX_DETAILS) append("    at ").append(it.toString().take(1024)).append('\n')
          }
          if (length >= CrashReportSanitizer.MAX_DETAILS) break
          current = current.cause
          depth++
        }
      }
      write(context, "Java uncaught exception", "Thread: ${threadName.take(200)}", details)
    }
  }

  @Synchronized
  fun read(context: Context): PendingCrashReport? = runCatching {
    val bytes = ByteArrayOutputStream()
    AtomicFile(reportFile(context)).openRead().use { input ->
      val chunk = ByteArray(4096)
      while (true) {
        val count = input.read(chunk, 0, minOf(chunk.size, MAX_BYTES + 1 - bytes.size()))
        if (count <= 0) break
        bytes.write(chunk, 0, count)
        if (bytes.size() > MAX_BYTES) return null
      }
    }
    val text = bytes.toString(StandardCharsets.UTF_8.name())
    val first = text.lineSequence().firstOrNull() ?: return null
    if (!first.startsWith("Report ID: ")) return null
    val id = first.removePrefix("Report ID: ")
    if (!id.matches(Regex("[a-f0-9-]{36}"))) return null
    PendingCrashReport(id, text)
  }.getOrNull()

  @Synchronized
  fun clear(context: Context, id: String): Boolean = runCatching {
    if (read(context)?.id != id) return false
    val file = reportFile(context)
    AtomicFile(file).delete()
    !file.exists()
  }.getOrDefault(false)

  @Synchronized
  fun copy(context: Context, id: String): Boolean = runCatching {
    val report = read(context) ?: return false
    if (report.id != id) return false
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? android.content.ClipboardManager ?: return false
    clipboard.setPrimaryClip(android.content.ClipData.newPlainText("Compás crash report", report.text))
    true
  }.getOrDefault(false)

  @Synchronized
  private fun write(context: Context, kind: String, message: String, stack: String): Boolean = runCatching {
    val id = UUID.randomUUID().toString()
    val date = SimpleDateFormat("yyyy-MM-dd HH:mm:ss 'UTC'", Locale.ROOT).apply {
      timeZone = java.util.TimeZone.getTimeZone("UTC")
    }.format(Date())
    val appVersion = runCatching {
      context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "unknown"
    }.getOrDefault("unknown").replace(Regex("[\r\n]"), " ").take(80)
    val device = "${Build.MANUFACTURER} ${Build.MODEL}".replace(Regex("[\r\n]"), " ").take(100)
    val details = CrashReportSanitizer.redact("$message\n$stack")
    val report = "Report ID: $id\nCompás Remote local diagnostic\nType: $kind\nDate: $date\nApp version: $appVersion\nAndroid: ${Build.VERSION.RELEASE}\nDevice: $device\n\n$details"
    val bytes = report.toByteArray(StandardCharsets.UTF_8).let { if (it.size <= MAX_BYTES) it else it.copyOf(MAX_BYTES) }
    val atomicFile = AtomicFile(reportFile(context))
    val stream = atomicFile.startWrite()
    try {
      stream.write(bytes)
      atomicFile.finishWrite(stream)
    } catch (error: Throwable) {
      atomicFile.failWrite(stream)
      throw error
    }
    true
  }.getOrDefault(false)

  private fun reportFile(context: Context) = File(context.noBackupFilesDir, FILE_NAME)
}
