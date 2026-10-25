package com.compas.remote.mediasession

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.media.MediaRoute2Info
import android.media.MediaRoute2ProviderService
import android.media.MediaRouter2
import android.media.RouteDiscoveryPreference
import android.media.RoutingSessionInfo
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import androidx.annotation.RequiresApi

/**
 * System UI labels a remote media session with the routing session whose id matches the
 * session's volumeControlId, and shows "Other device" when none does. This provider publishes
 * one routing session named after the player so the notification says where music is playing.
 */
@RequiresApi(Build.VERSION_CODES.R)
class PlayerRouteProviderService : MediaRoute2ProviderService() {
    private var sessionPublished = false
    private var publishedSinceBind = false

    override fun onCreate() {
        super.onCreate()
        instance = this
    }

    override fun onDestroy() {
        if (instance === this) instance = null
        super.onDestroy()
    }

    override fun onBind(intent: Intent): IBinder? {
        publishedSinceBind = false
        return super.onBind(intent)
    }

    // The system sends the discovery preference right after it connects, so the callback that
    // carries sessions to it exists by now; sessions created earlier only lived in this process.
    override fun onDiscoveryPreferenceChanged(preference: RouteDiscoveryPreference) {
        if (publishedSinceBind) return
        publishedSinceBind = true
        publish(recreate = true)
    }

    fun publish(recreate: Boolean = false) {
        val name = deviceName
        if (sessionPublished && (recreate || name == null)) {
            notifySessionReleased(SESSION_ID)
            sessionPublished = false
        }
        if (name == null) {
            notifyRoutes(emptyList())
            return
        }
        notifyRoutes(
            listOf(
                MediaRoute2Info.Builder(ROUTE_ID, name)
                    .addFeature(FEATURE)
                    .setConnectionState(MediaRoute2Info.CONNECTION_STATE_CONNECTED)
                    .setVolumeHandling(MediaRoute2Info.PLAYBACK_VOLUME_FIXED)
                    .build()
            )
        )
        val session = RoutingSessionInfo.Builder(SESSION_ID, packageName)
            .addSelectedRoute(ROUTE_ID)
            .setName(name)
            .setVolumeHandling(MediaRoute2Info.PLAYBACK_VOLUME_FIXED)
            .build()
        if (sessionPublished) {
            notifySessionUpdated(session)
        } else {
            notifySessionCreated(REQUEST_ID_NONE, session)
            sessionPublished = true
        }
    }

    // The player is the only route and it is already selected; there is nothing to switch to.
    override fun onCreateSession(requestId: Long, packageName: String, routeId: String, sessionHints: Bundle?) {
        notifyRequestFailed(requestId, REASON_ROUTE_NOT_AVAILABLE)
    }

    override fun onReleaseSession(requestId: Long, sessionId: String) = Unit
    override fun onSelectRoute(requestId: Long, sessionId: String, routeId: String) = Unit
    override fun onDeselectRoute(requestId: Long, sessionId: String, routeId: String) = Unit
    override fun onTransferToRoute(requestId: Long, sessionId: String, routeId: String) = Unit
    override fun onSetRouteVolume(requestId: Long, routeId: String, volume: Int) = Unit
    override fun onSetSessionVolume(requestId: Long, sessionId: String, volume: Int) = Unit

    companion object {
        private const val SESSION_ID = "compas-player"
        private const val ROUTE_ID = "compas-player-route"
        private const val FEATURE = "com.compas.remote.feature.PLAYER"

        private var instance: PlayerRouteProviderService? = null
        private var deviceName: String? = null
        private var router: MediaRouter2? = null
        private val routeCallback = object : MediaRouter2.RouteCallback() {}

        /**
         * The routing session's system-wide id, "provider component:session id". The system leaves
         * the owner package of provider-created sessions empty, so the short id would not match.
         */
        fun volumeControlId(context: Context): String =
            ComponentName(context, PlayerRouteProviderService::class.java).flattenToShortString() + ":" + SESSION_ID

        /** Main thread only. A null name withdraws the session. */
        fun setDeviceName(context: Context, name: String?) {
            if (name == deviceName) return
            deviceName = name
            // The system binds route providers only while some app asks for their routes.
            if (name != null && router == null) {
                router = MediaRouter2.getInstance(context.applicationContext).also {
                    it.registerRouteCallback(
                        context.mainExecutor,
                        routeCallback,
                        RouteDiscoveryPreference.Builder(listOf(FEATURE), false).build()
                    )
                }
            } else if (name == null) {
                router?.unregisterRouteCallback(routeCallback)
                router = null
            }
            instance?.publish()
        }
    }
}
