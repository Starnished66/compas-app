package com.compas.remote.mediasession

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.drawable.Icon
import android.media.MediaMetadata
import android.media.VolumeProvider
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.annotation.RequiresApi
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.InputStream
import java.net.URL
import java.util.concurrent.Executors

class CompasMediaSessionModule : Module() {
    private val mainHandler = Handler(Looper.getMainLooper())
    private val context: Context
        get() = appContext.reactContext ?: throw IllegalStateException("React context is unavailable")

    private var session: MediaSession? = null
    private var volumeProvider: VolumeProvider? = null
    private var currentVolume = 0.5f
    private var currentPlaying = false
    private val bgExecutor = Executors.newSingleThreadExecutor()
    @Volatile private var sessionGeneration = 0
    private var backgroundTicking = false
    private val backgroundTick = object : Runnable {
        override fun run() {
            sendEvent("onBackgroundTick", emptyMap<String, Any>())
            mainHandler.postDelayed(this, BACKGROUND_TICK_MS)
        }
    }

    override fun definition() = ModuleDefinition {
        Name("CompasMediaSession")

        Events("onMediaAction", "onBackgroundTick")

        AsyncFunction("updateState") { update: Map<String, Any?>, promise: Promise ->
            try {
                val title = update["title"] as? String ?: ""
                val artist = update["artist"] as? String ?: ""
                val album = update["album"] as? String ?: ""
                val durationMs = (update["durationMs"] as? Number)?.toDouble() ?: 0.0
                val artworkUri = update["artworkUri"] as? String
                val isPlaying = update["isPlaying"] as? Boolean ?: false
                val positionMs = (update["positionMs"] as? Number)?.toDouble() ?: 0.0
                val volume = (update["volume"] as? Number)?.toDouble() ?: 0.5
                val deviceName = (update["deviceName"] as? String)?.takeIf { it.isNotBlank() }

                currentVolume = volume.toFloat().coerceIn(0f, 1f)
                currentPlaying = isPlaying
                ensureSession()
                val activeSession = session ?: return@AsyncFunction

                volumeProvider?.setCurrentVolume((currentVolume * 100).toInt())
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    mainHandler.post { PlayerRouteProviderService.setDeviceName(context, deviceName) }
                }

                val actions = PlaybackState.ACTION_PLAY or
                    PlaybackState.ACTION_PAUSE or
                    PlaybackState.ACTION_PLAY_PAUSE or
                    PlaybackState.ACTION_SKIP_TO_NEXT or
                    PlaybackState.ACTION_SKIP_TO_PREVIOUS or
                    PlaybackState.ACTION_SEEK_TO

                activeSession.setPlaybackState(
                    PlaybackState.Builder()
                        .setActions(actions)
                        .setState(
                            if (isPlaying) PlaybackState.STATE_PLAYING else PlaybackState.STATE_PAUSED,
                            positionMs.toLong().coerceAtLeast(0),
                            if (isPlaying) 1f else 0f
                        )
                        .build()
                )

                val generation = sessionGeneration
                bgExecutor.submit {
                    var bitmap: Bitmap? = null
                    if (!artworkUri.isNullOrBlank()) {
                        runCatching {
                            bitmap = if (artworkUri.startsWith("file://") || artworkUri.startsWith("/")) {
                                val cleanPath = artworkUri.removePrefix("file://")
                                val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                                BitmapFactory.decodeFile(cleanPath, bounds)
                                BitmapFactory.decodeFile(cleanPath, sampledOptions(bounds))
                            } else if (artworkUri.startsWith("http://") || artworkUri.startsWith("https://")) {
                                // A stalled player must not block every later update on this single thread.
                                val connection = URL(artworkUri).openConnection().apply {
                                    connectTimeout = ARTWORK_TIMEOUT_MS
                                    readTimeout = ARTWORK_TIMEOUT_MS
                                }
                                val bytes = connection.getInputStream().use { stream: InputStream -> readBounded(stream) }
                                if (bytes == null) null else {
                                    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                                    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
                                    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, sampledOptions(bounds))
                                }
                            } else null
                        }
                    }
                    // clearState ran while the artwork loaded; don't bring the session back.
                    if (generation != sessionGeneration) return@submit

                    val metaBuilder = MediaMetadata.Builder()
                        .putString(MediaMetadata.METADATA_KEY_TITLE, title)
                        .putString(MediaMetadata.METADATA_KEY_ARTIST, artist)
                        .putString(MediaMetadata.METADATA_KEY_ALBUM, album)
                        .putLong(MediaMetadata.METADATA_KEY_DURATION, durationMs.toLong().coerceAtLeast(0))

                    if (bitmap != null) {
                        metaBuilder.putBitmap(MediaMetadata.METADATA_KEY_ART, bitmap)
                    }

                    activeSession.setMetadata(metaBuilder.build())
                    if (!activeSession.isActive) {
                        activeSession.isActive = true
                    }
                    showNotification(title, artist, bitmap, isPlaying, activeSession)
                }

                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("SESSION_UPDATE_FAILED", e.message, e)
            }
        }

        AsyncFunction("clearState") { promise: Promise ->
            try {
                clearSessionInternal()
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("SESSION_CLEAR_FAILED", e.message, e)
            }
        }

        // Start and stop run on the main thread, where the service's own callbacks run,
        // so the pending-start bookkeeping in RemotePlaybackService needs no locking.
        AsyncFunction("startPlaybackService") { message: String?, promise: Promise ->
            mainHandler.post {
                try {
                    val intent = Intent(context, RemotePlaybackService::class.java).apply {
                        action = RemotePlaybackService.ACTION_PREPARE
                        putExtra(RemotePlaybackService.EXTRA_MESSAGE, message ?: "Connecting to player…")
                    }
                    RemotePlaybackService.pendingStarts++
                    RemotePlaybackService.stopRequested = false
                    try {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                            context.startForegroundService(intent)
                        } else {
                            context.startService(intent)
                        }
                    } catch (e: Exception) {
                        RemotePlaybackService.pendingStarts--
                        throw e
                    }
                    startBackgroundTicks()
                    promise.resolve(true)
                } catch (e: Exception) {
                    promise.reject("SERVICE_START_FAILED", e.message, e)
                }
            }
        }

        AsyncFunction("stopPlaybackService") { promise: Promise ->
            mainHandler.post {
                try {
                    RemotePlaybackService.requestStop(context)
                    stopBackgroundTicks()
                    promise.resolve(true)
                } catch (e: Exception) {
                    promise.reject("SERVICE_STOP_FAILED", e.message, e)
                }
            }
        }

        OnDestroy {
            stopBackgroundTicks()
            releaseSessionInternal()
            bgExecutor.shutdownNow()
        }
    }

    private fun ensureSession() {
        if (session != null) return
        ensureChannel()

        val initialVolume = (currentVolume * 100).toInt()
        val vp = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            PlayerVolumeProvider(initialVolume, PlayerRouteProviderService.volumeControlId(context))
        } else {
            PlayerVolumeProvider(initialVolume)
        }
        volumeProvider = vp

        val ms = MediaSession(context, "CompasRemote").apply {
            setCallback(object : MediaSession.Callback() {
                override fun onPlay() {
                    sendEvent("onMediaAction", mapOf("action" to "play"))
                }

                override fun onPause() {
                    sendEvent("onMediaAction", mapOf("action" to "pause"))
                }

                override fun onSkipToNext() {
                    sendEvent("onMediaAction", mapOf("action" to "next"))
                }

                override fun onSkipToPrevious() {
                    sendEvent("onMediaAction", mapOf("action" to "previous"))
                }

                override fun onSeekTo(pos: Long) {
                    sendEvent("onMediaAction", mapOf("action" to "seekTo", "positionMs" to pos.toDouble()))
                }
            })
            setFlags(MediaSession.FLAG_HANDLES_MEDIA_BUTTONS or MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS)
            setPlaybackToRemote(vp)
        }
        session = ms
        activeInstance = this
    }

    private inner class PlayerVolumeProvider : VolumeProvider {
        constructor(current: Int) : super(VOLUME_CONTROL_ABSOLUTE, 100, current)

        // The id ties the session to PlayerRouteProviderService's routing session.
        @RequiresApi(Build.VERSION_CODES.R)
        constructor(current: Int, volumeControlId: String) : super(VOLUME_CONTROL_ABSOLUTE, 100, current, volumeControlId)

        // Inside this class `currentVolume` is VolumeProvider's own 0-100 value, not the module's 0-1 field.
        override fun onAdjustVolume(direction: Int) {
            if (direction != -1 && direction != 1) return
            applyVolume(currentVolume + direction * 5)
        }

        override fun onSetVolumeTo(volume: Int) = applyVolume(volume)

        private fun applyVolume(percent: Int) {
            val clamped = percent.coerceIn(0, 100)
            this@CompasMediaSessionModule.currentVolume = clamped / 100f
            setCurrentVolume(clamped)
            sendEvent("onMediaAction", mapOf("action" to "setVolume", "volume" to clamped / 100.0))
        }
    }

    private fun showNotification(title: String, artist: String, artwork: Bitmap?, isPlaying: Boolean, session: MediaSession) {
        val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val contentIntent = PendingIntent.getActivity(
            context,
            0,
            launchIntent ?: Intent(),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val prevIntent = actionPendingIntent(ACTION_PREVIOUS, 1)
        val toggleIntent = actionPendingIntent(ACTION_TOGGLE, 2)
        val nextIntent = actionPendingIntent(ACTION_NEXT, 3)

        val smallIconRes = context.applicationInfo.icon

        val builder = Notification.Builder(context, CHANNEL_ID)
            .setSmallIcon(smallIconRes)
            .setContentTitle(title)
            .setContentText(artist)
            .setLargeIcon(artwork)
            .setContentIntent(contentIntent)
            .setOnlyAlertOnce(true)
            .setOngoing(isPlaying)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .addAction(
                Notification.Action.Builder(
                    Icon.createWithResource(context, android.R.drawable.ic_media_previous),
                    "Previous",
                    prevIntent
                ).build()
            )
            .addAction(
                Notification.Action.Builder(
                    Icon.createWithResource(
                        context,
                        if (isPlaying) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play
                    ),
                    if (isPlaying) "Pause" else "Play",
                    toggleIntent
                ).build()
            )
            .addAction(
                Notification.Action.Builder(
                    Icon.createWithResource(context, android.R.drawable.ic_media_next),
                    "Next",
                    nextIntent
                ).build()
            )
            .setStyle(
                Notification.MediaStyle()
                    .setMediaSession(session.sessionToken)
                    .setShowActionsInCompactView(0, 1, 2)
            )

        val notification = builder.build()
        val service = RemotePlaybackService.instance
        if (service != null) {
            service.publishNotification(notification)
        } else {
            runCatching {
                NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification)
            }
        }
    }

    private fun actionPendingIntent(action: String, requestCode: Int): PendingIntent {
        val intent = Intent(context, MediaActionReceiver::class.java).setAction(action)
        return PendingIntent.getBroadcast(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun clearSessionInternal() {
        sessionGeneration++
        val ms = session ?: return
        ms.isActive = false
        ms.setMetadata(null)
        ms.setPlaybackState(PlaybackState.Builder().setState(PlaybackState.STATE_NONE, 0, 0f).build())
        mainHandler.post {
            RemotePlaybackService.requestStop(context)
            stopBackgroundTicks()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                PlayerRouteProviderService.setDeviceName(context, null)
            }
        }
        runCatching {
            NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
        }
    }

    // React Native runs JS timers on Choreographer frames, which stop once the app is in the
    // background (immediately on Samsung). Without them the status poll stops and the notification
    // stays on the song that was playing. While the playback service is up, this event wakes
    // the poll instead. Main thread only.
    private fun startBackgroundTicks() {
        if (backgroundTicking) return
        backgroundTicking = true
        mainHandler.postDelayed(backgroundTick, BACKGROUND_TICK_MS)
    }

    private fun stopBackgroundTicks() {
        backgroundTicking = false
        mainHandler.removeCallbacks(backgroundTick)
    }

    private fun releaseSessionInternal() {
        clearSessionInternal()
        session?.release()
        session = null
        if (activeInstance === this) {
            activeInstance = null
        }
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

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = context.getSystemService(NotificationManager::class.java)
            val channel = NotificationChannel(CHANNEL_ID, "Playback", NotificationManager.IMPORTANCE_LOW)
            channel.description = "Compás playback controls and connection state"
            manager.createNotificationChannel(channel)
        }
    }

    companion object {
        const val NOTIFICATION_ID = RemotePlaybackService.NOTIFICATION_ID
        private const val BACKGROUND_TICK_MS = 5000L
        private const val ARTWORK_TIMEOUT_MS = 5000
        private const val ARTWORK_TARGET_PX = 512
        private const val ARTWORK_MAX_BYTES = 8 * 1024 * 1024
        const val CHANNEL_ID = RemotePlaybackService.CHANNEL_ID
        const val ACTION_PREVIOUS = "com.compas.remote.PREVIOUS"
        const val ACTION_TOGGLE = "com.compas.remote.TOGGLE"
        const val ACTION_NEXT = "com.compas.remote.NEXT"

        @Volatile
        private var activeInstance: CompasMediaSessionModule? = null

        fun dispatchAction(action: String?) {
            val instance = activeInstance ?: return
            when (action) {
                ACTION_PREVIOUS -> instance.sendEvent("onMediaAction", mapOf("action" to "previous"))
                ACTION_TOGGLE -> instance.sendEvent("onMediaAction", mapOf("action" to "toggle"))
                ACTION_NEXT -> instance.sendEvent("onMediaAction", mapOf("action" to "next"))
            }
        }
    }
}
