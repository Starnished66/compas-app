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
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val CHANNEL_ID = "compas-updates"
private const val CHANNEL_NAME = "Compás Updates"
private const val FIRMWARE_NOTIFICATION_ID = 9401
private const val APPLICATION_NOTIFICATION_ID = 9402
private const val MAX_VERSION_LENGTH = 64

class CompasUpdatesModule : Module() {
    private val context: Context
        get() = appContext.reactContext?.applicationContext
            ?: throw IllegalStateException("React context is unavailable")

    override fun definition() = ModuleDefinition {
        Name("CompasUpdates")

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
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                addCategory(Intent.CATEGORY_BROWSABLE)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            val pendingIntent = PendingIntent.getActivity(
                context,
                notificationId,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            val title = if (kind == "firmware") {
                "Compás firmware $version released"
            } else {
                "Compás Remote $version available"
            }
            val notification = NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.stat_sys_download_done)
                .setContentTitle(title)
                .setContentText("Review release notes.")
                .setStyle(NotificationCompat.BigTextStyle().bigText("Review the release notes for details."))
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

    private fun isTrustedReleaseUrl(url: String, repository: String, version: String): Boolean {
        if (url.length > 512) return false
        val expectedPath = "/Starnished66/$repository/releases/tag/$version"
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
