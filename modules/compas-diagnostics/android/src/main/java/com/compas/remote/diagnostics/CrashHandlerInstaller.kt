package com.compas.remote.diagnostics

import android.app.Application
import kotlin.system.exitProcess

object CrashHandlerInstaller {
  @Volatile private var installed = false

  @Synchronized
  fun install(application: Application) {
    if (installed) return
    val previous = Thread.getDefaultUncaughtExceptionHandler()
    Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
      try {
        runCatching { CrashReportStore.writeNative(application, thread.name, throwable) }
      } finally {
        try {
          previous?.uncaughtException(thread, throwable)
        } finally {
          // Preserve fatal semantics even when a third-party handler returns or throws.
          android.os.Process.killProcess(android.os.Process.myPid())
          exitProcess(10)
        }
      }
    }
    installed = true
  }
}
