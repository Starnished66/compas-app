package com.compas.remote.mediasession

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log

class RemotePlaybackService : Service() {
    private var foreground = false

    override fun onCreate() {
        super.onCreate()
        instance = this
        ensureChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent == null) {
            // A sticky restart has no authorization context from the original app start.
            // Do not try to promote it back to foreground from the background.
            stopSelf(startId)
            return START_NOT_STICKY
        }

        val action = intent.action
        if (action == ACTION_STOP) {
            stopPlaybackService()
            return START_NOT_STICKY
        }
        if (action != ACTION_PREPARE) {
            stopSelf(startId)
            return START_NOT_STICKY
        }

        val message = intent.getStringExtra(EXTRA_MESSAGE) ?: "Connecting to player…"
        return if (publishWaitingNotification(message)) START_STICKY else START_NOT_STICKY
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Playback",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Compás playback controls and connection state"
                setShowBadge(false)
            }
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.createNotificationChannel(channel)
        }
    }

    fun publishWaitingNotification(message: String): Boolean {
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            this.flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val openIntent = PendingIntent.getActivity(
            this, 0,
            launchIntent ?: Intent(),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }
        val notification = builder
            .setSmallIcon(applicationInfo.icon)
            .setContentTitle("Compás")
            .setContentText(message)
            .setContentIntent(openIntent)
            .setOngoing(true)
            .build()

        return publishNotification(notification)
    }

    fun publishNotification(notification: Notification): Boolean {
        if (!foreground) {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
                } else {
                    startForeground(NOTIFICATION_ID, notification)
                }
                foreground = true
            } catch (failure: IllegalStateException) {
                return handleForegroundPromotionDenied(failure)
            } catch (failure: SecurityException) {
                return handleForegroundPromotionDenied(failure)
            }
        } else {
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.notify(NOTIFICATION_ID, notification)
        }
        return true
    }

    private fun handleForegroundPromotionDenied(failure: RuntimeException): Boolean {
        Log.w(TAG, "Foreground promotion was denied; stopping playback service", failure)
        stopPlaybackService()
        return false
    }

    fun stopPlaybackService() {
        if (foreground) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(STOP_FOREGROUND_REMOVE)
            } else {
                @Suppress("DEPRECATION")
                stopForeground(true)
            }
            foreground = false
        }
        stopSelf()
    }

    override fun onDestroy() {
        instance = null
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        const val CHANNEL_ID = "compas_playback"
        const val NOTIFICATION_ID = 1001
        const val ACTION_PREPARE = "com.compas.remote.PREPARE_PLAYBACK_SERVICE"
        const val ACTION_STOP = "com.compas.remote.STOP_PLAYBACK_SERVICE"
        const val EXTRA_MESSAGE = "com.compas.remote.EXTRA_MESSAGE"
        private const val TAG = "RemotePlaybackService"

        var instance: RemotePlaybackService? = null
            private set
    }
}
