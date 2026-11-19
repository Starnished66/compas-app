package com.compas.remote.bluetooth

internal const val INQUIRY_WATCH_TIMEOUT_MS = 30_000L

// The adapter is shared by all module instances. Access is confined to the main thread.
internal class BluetoothDiscoveryTurn {
    private class Waiter(val start: () -> Unit, val cancel: () -> Unit)

    private var owner: BluetoothInquiry? = null
    private var finishTimedOut = false
    private val waiting = LinkedHashMap<BluetoothInquiry, Waiter>()

    fun owns(inquiry: BluetoothInquiry): Boolean = owner === inquiry

    fun tryAcquire(inquiry: BluetoothInquiry): Boolean {
        if (owner != null && !owns(inquiry)) return false
        owner = inquiry
        if (finishTimedOut) inquiry.expectLateFinish()
        return true
    }

    fun request(inquiry: BluetoothInquiry, start: () -> Unit, cancel: () -> Unit) {
        cancelWait(inquiry)
        if (tryAcquire(inquiry)) start()
        else waiting[inquiry] = Waiter(start, cancel)
    }

    fun cancelWait(inquiry: BluetoothInquiry) {
        waiting.remove(inquiry)?.cancel?.invoke()
    }

    fun release(inquiry: BluetoothInquiry) {
        if (!owns(inquiry)) return
        finishTimedOut = finishTimedOut || inquiry.finishTimedOut
        owner = null
        val next = waiting.entries.firstOrNull() ?: return
        val nextOwner = next.key
        val start = next.value.start
        waiting.remove(nextOwner)
        tryAcquire(nextOwner)
        start()
    }
}

// Finish broadcasts have no scan ID. After a timeout, track new inquiries by adapter state.
internal class BluetoothInquiry {
    var awaitingFinish = false
        private set
    private var completeScan: (() -> Unit)? = null
    private var startReplacement: (() -> Unit)? = null
    private var cancelReplacement: (() -> Unit)? = null
    var finishTimedOut = false
        private set
    private var acceptedInquiry = false
    private var observedStart = false
    private var cancelOnStart = false
    private var releaseAfterDestroy: (() -> Unit)? = null
    val tracksAdapterState: Boolean get() = finishTimedOut && acceptedInquiry
    val needsAdapterCheck: Boolean get() =
        awaitingFinish && (cancelOnStart || tracksAdapterState || (finishTimedOut && startReplacement != null))
    val waitingAfterDestroy: Boolean get() = releaseAfterDestroy != null

    fun started(onFinished: () -> Unit = {}) {
        awaitingFinish = true
        acceptedInquiry = true
        completeScan = onFinished
        observedStart = false
        cancelOnStart = false
    }

    fun cancellingActiveInquiry() {
        awaitingFinish = true
        cancelOnStart = true
    }

    fun queueReplacement(start: () -> Unit, cancel: () -> Unit) {
        startReplacement = start
        cancelReplacement = cancel
    }

    fun stop() {
        cancelOnStart = awaitingFinish
        completeScan = null
        val cancel = cancelReplacement
        startReplacement = null
        cancelReplacement = null
        cancel?.invoke()
    }

    fun destroy(cancelIfActive: () -> Unit, release: () -> Unit) {
        stop()
        if (!awaitingFinish) {
            release()
            return
        }
        releaseAfterDestroy = release
        cancelIfActive()
    }

    fun destroyTimedOut() {
        if (!waitingAfterDestroy) return
        expectLateFinish()
        finishDestroy()
    }

    private fun finishDestroy() {
        val release = releaseAfterDestroy ?: return
        releaseAfterDestroy = null
        awaitingFinish = false
        acceptedInquiry = false
        release()
    }

    fun replacementTimedOut() {
        expectLateFinish()
        stop()
        acceptedInquiry = false
    }

    fun expectLateFinish() {
        finishTimedOut = true
    }

    fun recoverIfIdle(isDiscovering: Boolean) {
        if (finishTimedOut && !isDiscovering && !acceptedInquiry) awaitingFinish = false
    }

    fun discoveryStarted(isDiscovering: Boolean, cancel: () -> Boolean) {
        if (!awaitingFinish || !isDiscovering) return
        observedStart = true
        if (cancelOnStart && cancel()) cancelOnStart = false
    }

    fun finished(isDiscovering: Boolean) {
        if (!awaitingFinish || isDiscovering || tracksAdapterState) return
        complete()
    }

    fun checkAdapter(isDiscovering: Boolean?, elapsedMs: Long, cancel: () -> Boolean) {
        if (!needsAdapterCheck) return
        if (isDiscovering == true) discoveryStarted(isDiscovering, cancel)
        val becameIdle = finishTimedOut && isDiscovering == false && (!acceptedInquiry || observedStart)
        val scanTimedOut = tracksAdapterState && elapsedMs >= INQUIRY_WATCH_TIMEOUT_MS
        if (becameIdle || scanTimedOut) {
            complete()
        }
    }

    private fun complete() {
        awaitingFinish = false
        acceptedInquiry = false
        val complete = completeScan
        val start = startReplacement
        completeScan = null
        startReplacement = null
        cancelReplacement = null
        complete?.invoke()
        start?.invoke()
        finishDestroy()
    }
}
