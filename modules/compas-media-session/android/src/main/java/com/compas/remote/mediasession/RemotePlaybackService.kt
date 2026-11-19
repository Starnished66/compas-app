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
import androidx.core.app.NotificationManagerCompat

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

        // Every startForegroundService() must reach startForeground(), even when a stop
        // arrived meanwhile; only then is it safe to honour that stop.
        if (pendingStarts > 0) pendingStarts--
        val message = intent.getStringExtra(EXTRA_MESSAGE) ?: "Connecting to player…"
        val notification = pendingMediaNotification
        if (pendingStarts == 0) pendingMediaNotification = null
        val promoted = if (notification != null) publishNotification(notification, promote = true)
            else publishWaitingNotification(message, promote = true)
        if (!promoted) return START_NOT_STICKY
        if (stopRequested && pendingStarts == 0) {
            stopRequested = false
            stopPlaybackService()
            return START_NOT_STICKY
        }
        return START_STICKY
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

    fun publishWaitingNotification(message: String, promote: Boolean = false): Boolean {
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

        return publishNotification(notification, promote)
    }

    /** promote forces startForeground(): Android expects it once per startForegroundService(),
     * even when the service is already in the foreground from an earlier start. */
    fun publishNotification(notification: Notification, promote: Boolean = false): Boolean {
        if (!foreground || promote) {
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
        requestStop(this)
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

        /** Foreground starts requested but not yet delivered to onStartCommand. Main thread only. */
        var pendingStarts = 0
        /** A stop requested while starts were pending; applied after the last one promotes. */
        var stopRequested = false

        private var pendingMediaNotification: Notification? = null

        // Session metadata can arrive before Android delivers a pending service start.
        fun publishMediaNotification(context: Context, notification: Notification) {
            if (pendingStarts > 0 && !stopRequested) pendingMediaNotification = notification
            val service = instance
            if (service != null) {
                service.publishNotification(notification)
            } else {
                runCatching { NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification) }
            }
        }

        /** Main thread only. Every stop goes through here: stopping while a start is still
         * undelivered kills the service before startForeground() and crashes the app. */
        fun requestStop(context: Context) {
            pendingMediaNotification = null
            if (pendingStarts > 0) {
                stopRequested = true
                return
            }
            instance?.stopPlaybackService() ?: run {
                val intent = Intent(context, RemotePlaybackService::class.java).apply { action = ACTION_STOP }
                context.stopService(intent)
            }
        }
    }
}
