package com.compas.remote.updates

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import java.util.concurrent.atomic.AtomicBoolean

private const val CHANNEL_ID = "compas-updates"
private const val CHANNEL_NAME = "Compás Updates"
private const val FIRMWARE_NOTIFICATION_ID = 9401
private const val APPLICATION_NOTIFICATION_ID = 9402
private const val MAX_VERSION_LENGTH = 64
internal const val EXTRA_INSTALL_APP_UPDATE = "com.compas.remote.updates.INSTALL_APP_UPDATE"
private const val EVENT_APP_UPDATE_INSTALL_REQUESTED = "onAppUpdateInstallRequested"

internal data class ReleaseNotificationCopy(
    val title: String,
    val contentText: String,
    val bigText: String,
)

internal fun releaseNotificationCopy(kind: String, version: String): ReleaseNotificationCopy =
    if (kind == "firmware") {
        ReleaseNotificationCopy(
            title = "Compás firmware $version released",
            contentText = "Review release notes.",
            bigText = "Review the release notes for details.",
        )
    } else {
        ReleaseNotificationCopy(
            title = "Compás Remote $version available",
            contentText = "Tap to download and install.",
            bigText = "Tap to download and install.",
        )
    }

class CompasUpdatesModule : Module() {
    private val installInFlight = AtomicBoolean(false)
    private val pendingAppUpdateInstall = AtomicBoolean(false)
    private val context: Context
        get() = appContext.reactContext?.applicationContext
            ?: throw IllegalStateException("React context is unavailable")

    override fun definition() = ModuleDefinition {
        Name("CompasUpdates")
        Events(EVENT_APP_UPDATE_INSTALL_REQUESTED)

        OnNewIntent { intent ->
            if (consumeIntentInstallFlag(intent)) {
                pendingAppUpdateInstall.set(true)
                runCatching { sendEvent(EVENT_APP_UPDATE_INSTALL_REQUESTED, emptyMap<String, Any>()) }
            }
        }

        Function("consumePendingAppUpdateInstall") {
            val fromActivity = consumeIntentInstallFlag(appContext.currentActivity?.intent)
            val fromNewIntent = pendingAppUpdateInstall.getAndSet(false)
            fromActivity || fromNewIntent
        }

        AsyncFunction("fetchAppUpdateManifest") { channel: String, promise: Promise ->
            Thread({
                try { promise.resolve(AppUpdateInstaller.fetchManifest(channel)) }
                catch (error: Exception) { promise.reject("ERR_UPDATE_CHECK", error.message, error) }
            }, "compas-app-update-check").start()
        }

        Function("getDeviceApiLevel") { Build.VERSION.SDK_INT }
        Function("canInstallAppUpdates") { context.packageManager.canRequestPackageInstalls() }
        Function("openAppUpdatePermissionSettings") {
            context.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
        AsyncFunction("installAppUpdate") { url: String, hash: String, versionCode: Long, size: Long, promise: Promise ->
            val application = context
            if (!application.packageManager.canRequestPackageInstalls()) {
                promise.reject("ERR_INSTALL_PERMISSION", "Allow application updates in Android Settings, then retry.", null)
            } else if (!installInFlight.compareAndSet(false, true)) {
                promise.reject("ERR_UPDATE_BUSY", "An application update is already being prepared.", null)
            } else {
                // Request-scoped worker: no service, wake lock or idle thread is retained.
                Thread({
                    try {
                        val file = AppUpdateInstaller.prepare(application, url, hash, versionCode, size)
                        Handler(Looper.getMainLooper()).post {
                            try { AppUpdateInstaller.openInstaller(application, file); promise.resolve() }
                            catch (error: Exception) { promise.reject("ERR_UPDATE_INSTALL", error.message, error) }
                            finally { installInFlight.set(false) }
                        }
                    } catch (error: Exception) {
                        installInFlight.set(false)
                        promise.reject("ERR_UPDATE_INSTALL", error.message, error)
                    }
                }, "compas-app-update").start()
            }
        }

        Function("getAppVersion") {
            val packageManager = context.packageManager
            val packageInfo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                packageManager.getPackageInfo(
                    context.packageName,
                    PackageManager.PackageInfoFlags.of(0)
                )
            } else {
                @Suppress("DEPRECATION")
                packageManager.getPackageInfo(context.packageName, 0)
            }
            mapOf(
                "version" to (packageInfo.versionName ?: ""),
                "versionCode" to if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    packageInfo.longVersionCode.toInt()
                } else {
                    @Suppress("DEPRECATION")
                    packageInfo.versionCode
                }
            )
        }

        Function("notificationsEnabled") {
            areNotificationsEnabled(context)
        }

        Function("notifyRelease") { kind: String, version: String, url: String ->
            postReleaseNotification(context, kind, version, url)
        }
    }

    private fun areNotificationsEnabled(context: Context): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !ensureChannel(context)) {
            return false
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            return false
        }
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return false
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = context.getSystemService(NotificationManager::class.java) ?: return false
            val channel = manager.getNotificationChannel(CHANNEL_ID) ?: return false
            return channel.importance != NotificationManager.IMPORTANCE_NONE
        }
        return true
    }

    private fun postReleaseNotification(context: Context, kind: String, version: String, url: String): Boolean {
        if (!areNotificationsEnabled(context)) return false
        if (version.length > MAX_VERSION_LENGTH || !version.matches(Regex("[A-Za-z0-9][A-Za-z0-9._-]{0,63}"))) return false

        val repository = when (kind) {
            "firmware" -> "compas-player"
            "application" -> "compas-app"
            else -> return false
        }
        if (!isTrustedReleaseUrl(url, repository, version)) return false

        return runCatching {
            val notificationId = if (kind == "firmware") FIRMWARE_NOTIFICATION_ID else APPLICATION_NOTIFICATION_ID
            val intent = if (kind == "firmware") {
                Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                    addCategory(Intent.CATEGORY_BROWSABLE)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
            } else {
                // Reopen the existing task and ask JS to run the verified in-app installer.
                context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                    putExtra(EXTRA_INSTALL_APP_UPDATE, true)
                } ?: return false
            }
            val pendingIntent = PendingIntent.getActivity(
                context,
                notificationId,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            val copy = releaseNotificationCopy(kind, version)
            val notification = NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.stat_sys_download_done)
                .setContentTitle(copy.title)
                .setContentText(copy.contentText)
                .setStyle(NotificationCompat.BigTextStyle().bigText(copy.bigText))
                .setContentIntent(pendingIntent)
                .setAutoCancel(true)
                .setSilent(true)
                .setOnlyAlertOnce(true)
                .setCategory(NotificationCompat.CATEGORY_STATUS)
                .build()
            NotificationManagerCompat.from(context).notify(notificationId, notification)
            true
        }.getOrDefault(false)
    }

    private fun consumeIntentInstallFlag(intent: Intent?): Boolean {
        if (intent == null || !intent.getBooleanExtra(EXTRA_INSTALL_APP_UPDATE, false)) return false
        intent.removeExtra(EXTRA_INSTALL_APP_UPDATE)
        // Reopening from Recents replays the old notification intent; only a real tap installs.
        return (intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) == 0
    }

    private fun isTrustedReleaseUrl(url: String, repository: String, version: String): Boolean {
        if (url.length > 512) return false
        val tag = if (repository == "compas-app") "v${version.removePrefix("v")}" else version
        val expectedPath = "/Starnished66/$repository/releases/tag/$tag"
        val uri = runCatching { Uri.parse(url) }.getOrNull() ?: return false
        return uri.scheme == "https" &&
            uri.host == "github.com" &&
            uri.port == -1 &&
            uri.encodedAuthority == "github.com" &&
            uri.encodedQuery == null &&
            uri.encodedFragment == null &&
            uri.encodedPath == expectedPath &&
            uri.toString() == "https://github.com$expectedPath"
    }

    private fun ensureChannel(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true
        val manager = context.getSystemService(NotificationManager::class.java) ?: return false
        val channel = NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_LOW).apply {
            description = "Compás player and app release notes"
            setSound(null, null)
            enableVibration(false)
            setShowBadge(false)
        }
        manager.createNotificationChannel(channel)
        return manager.getNotificationChannel(CHANNEL_ID) != null
    }
}
