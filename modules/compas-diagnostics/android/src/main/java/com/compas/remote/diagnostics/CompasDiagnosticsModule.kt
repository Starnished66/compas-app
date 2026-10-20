package com.compas.remote.diagnostics

import android.content.Context
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class CompasDiagnosticsModule : Module() {
  private val context: Context?
    get() = appContext.reactContext?.applicationContext

  override fun definition() = ModuleDefinition {
    Name("CompasDiagnostics")

    Function("getPendingReport") {
      runCatching {
        val report = CrashReportStore.read(context ?: return@Function null) ?: return@Function null
        mapOf("id" to report.id, "text" to report.text)
      }.getOrNull()
    }
    Function("clearReport") { id: String ->
      runCatching { CrashReportStore.clear(context ?: return@Function false, id) }.getOrDefault(false)
    }
    Function("copyReport") { id: String ->
      runCatching { CrashReportStore.copy(context ?: return@Function false, id) }.getOrDefault(false)
    }
    Function("recordJsError") { message: String, stack: String?, fatal: Boolean ->
      runCatching {
        CrashReportStore.writeJavaScript(context ?: return@Function false, message, stack.orEmpty(), fatal)
      }.getOrDefault(false)
    }
  }
}
