package com.compas.remote.mediasession

import android.app.Notification
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.drawable.Icon
import android.media.session.MediaSession

internal fun showMediaNotification(context: Context, title: String, artist: String, artwork: Bitmap?, isPlaying: Boolean, session: MediaSession) {
    val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
        flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }
    val contentIntent = PendingIntent.getActivity(
        context,
        0,
        launchIntent ?: Intent(),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    val prevIntent = actionPendingIntent(context, CompasMediaSessionModule.ACTION_PREVIOUS, 1)
    val toggleIntent = actionPendingIntent(context, CompasMediaSessionModule.ACTION_TOGGLE, 2)
    val nextIntent = actionPendingIntent(context, CompasMediaSessionModule.ACTION_NEXT, 3)

    val smallIconRes = context.applicationInfo.icon

    val builder = Notification.Builder(context, RemotePlaybackService.CHANNEL_ID)
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

    RemotePlaybackService.publishMediaNotification(context, builder.build())
}

private fun actionPendingIntent(context: Context, action: String, requestCode: Int): PendingIntent {
    val intent = Intent(context, MediaActionReceiver::class.java).setAction(action)
    return PendingIntent.getBroadcast(
        context,
        requestCode,
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
}
