package com.compas.remote.mediasession

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class MediaActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        CompasMediaSessionModule.dispatchAction(intent.action)
    }
}
