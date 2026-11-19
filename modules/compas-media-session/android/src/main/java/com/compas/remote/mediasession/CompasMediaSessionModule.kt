package com.compas.remote.mediasession

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.media.MediaMetadata
import android.media.VolumeProvider
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.annotation.RequiresApi
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
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
    private var metadata: SessionMetadata? = null
    private val artwork = MediaArtworkCache<Bitmap>(
        bgExecutor,
        ::decodeMediaArtwork,
        { deliver -> mainHandler.post { deliver() } },
        { retry -> mainHandler.postDelayed(retry, ARTWORK_RETRY_DELAY_MS) },
        { retry -> mainHandler.removeCallbacks(retry) },
        { runCatching { publishMetadata() } }
    )
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

        // Keep session, notification, and service updates on the same thread.
        AsyncFunction("updatePlayback") { update: Map<String, Any?>, promise: Promise ->
            mainHandler.post {
                try {
                    updatePlayback(update)
                    promise.resolve(true)
                } catch (e: Exception) {
                    promise.reject("SESSION_UPDATE_FAILED", e.message, e)
                }
            }
        }

        AsyncFunction("updateMetadata") { update: Map<String, Any?>, promise: Promise ->
            mainHandler.post {
                try {
                    updateMetadata(update)
                    promise.resolve(true)
                } catch (e: Exception) {
                    promise.reject("SESSION_UPDATE_FAILED", e.message, e)
                }
            }
        }

        AsyncFunction("clearState") { promise: Promise ->
            mainHandler.post {
                try {
                    clearSessionInternal(context)
                    promise.resolve(true)
                } catch (e: Exception) {
                    promise.reject("SESSION_CLEAR_FAILED", e.message, e)
                }
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
            val reactContext = appContext.reactContext
            mainHandler.post {
                stopBackgroundTicks()
                releaseSessionInternal(reactContext)
                bgExecutor.shutdownNow()
            }
        }
    }

    private fun updatePlayback(update: Map<String, Any?>) {
        val isPlaying = update["isPlaying"] as? Boolean ?: false
        val positionMs = (update["positionMs"] as? Number)?.toLong()?.coerceAtLeast(0) ?: 0L
        val volume = (update["volume"] as? Number)?.toFloat()?.coerceIn(0f, 1f) ?: 0.5f
        val playingChanged = isPlaying != currentPlaying
        currentVolume = volume
        currentPlaying = isPlaying

        ensureSession()
        val activeSession = session ?: return
        val volumePercent = (volume * 100).toInt()
        volumeProvider?.let {
            if (it.currentVolume != volumePercent) it.setCurrentVolume(volumePercent)
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
                    positionMs,
                    if (isPlaying) 1f else 0f
                )
                .build()
        )
        if (playingChanged) publishNotification()
    }

    private fun updateMetadata(update: Map<String, Any?>) {
        ensureSession()
        metadata = SessionMetadata(
            title = update["title"] as? String ?: "",
            artist = update["artist"] as? String ?: "",
            album = update["album"] as? String ?: "",
            durationMs = (update["durationMs"] as? Number)?.toLong()?.coerceAtLeast(0) ?: 0L
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val deviceName = (update["deviceName"] as? String)?.takeIf { it.isNotBlank() }
            PlayerRouteProviderService.setDeviceName(context, deviceName)
        }
        artwork.load((update["artworkUri"] as? String)?.takeIf { it.isNotBlank() })
        publishMetadata()
    }

    private fun publishMetadata() {
        val activeSession = session ?: return
        val current = metadata ?: return
        val builder = MediaMetadata.Builder()
            .putString(MediaMetadata.METADATA_KEY_TITLE, current.title)
            .putString(MediaMetadata.METADATA_KEY_ARTIST, current.artist)
            .putString(MediaMetadata.METADATA_KEY_ALBUM, current.album)
            .putLong(MediaMetadata.METADATA_KEY_DURATION, current.durationMs)
        artwork.bitmap?.let { builder.putBitmap(MediaMetadata.METADATA_KEY_ART, it) }
        activeSession.setMetadata(builder.build())
        if (!activeSession.isActive) activeSession.isActive = true
        publishNotification()
    }

    private fun publishNotification() {
        val activeSession = session ?: return
        val current = metadata ?: return
        showMediaNotification(context, current.title, current.artist, artwork.bitmap, currentPlaying, activeSession)
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

    private fun clearSessionInternal(context: Context?) {
        artwork.load(null)
        metadata = null
        val ms = session ?: return
        stopBackgroundTicks()
        ms.isActive = false
        ms.setMetadata(null)
        ms.setPlaybackState(PlaybackState.Builder().setState(PlaybackState.STATE_NONE, 0, 0f).build())
        if (context != null) {
            RemotePlaybackService.requestStop(context)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                PlayerRouteProviderService.setDeviceName(context, null)
            }
            runCatching {
                NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
            }
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

    private fun releaseSessionInternal(context: Context?) {
        clearSessionInternal(context)
        session?.release()
        session = null
        if (activeInstance === this) {
            activeInstance = null
        }
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = context.getSystemService(NotificationManager::class.java)
            val channel = NotificationChannel(CHANNEL_ID, "Playback", NotificationManager.IMPORTANCE_LOW)
            channel.description = "Compás playback controls and connection state"
            manager.createNotificationChannel(channel)
        }
    }

    private data class SessionMetadata(
        val title: String,
        val artist: String,
        val album: String,
        val durationMs: Long
    )

    companion object {
        const val NOTIFICATION_ID = RemotePlaybackService.NOTIFICATION_ID
        private const val BACKGROUND_TICK_MS = 5000L
        private const val ARTWORK_RETRY_DELAY_MS = 1000L
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
