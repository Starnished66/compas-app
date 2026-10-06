/**
 * Request and synchronization policies for Compás Remote.
 * Directly corresponds to BluetoothRequestPolicy.kt and CatalogSyncPolicy.kt.
 */

import { ConnectionTransport } from './models';

export const BluetoothRequestPolicy = {
  STATUS_POLL_INTERVAL_MS: 5000,
  QUEUE_POLL_INTERVAL_MS: 30000,
  ARTWORK_MIN_INTERVAL_MS: 5000,

  /**
   * Older players report no route; treat that unknown value as Bluetooth audio for safety.
   */
  requiresBluetoothAudioPriority(
    transport: ConnectionTransport,
    bluetoothAudioOutput?: boolean | null
  ): boolean {
    return transport === 'bluetooth' && bluetoothAudioOutput !== false;
  },

  enteredBluetoothAudioPriority(
    transport: ConnectionTransport,
    previousBluetoothAudioOutput: boolean | null | undefined,
    currentBluetoothAudioOutput: boolean | null | undefined
  ): boolean {
    return (
      !this.requiresBluetoothAudioPriority(transport, previousBluetoothAudioOutput) &&
      this.requiresBluetoothAudioPriority(transport, currentBluetoothAudioOutput)
    );
  },

  leftBluetoothAudioPriority(
    transport: ConnectionTransport,
    previousBluetoothAudioOutput: boolean | null | undefined,
    currentBluetoothAudioOutput: boolean | null | undefined
  ): boolean {
    return (
      this.requiresBluetoothAudioPriority(transport, previousBluetoothAudioOutput) &&
      !this.requiresBluetoothAudioPriority(transport, currentBluetoothAudioOutput)
    );
  },

  needsForegroundRecoveryAfterPriorityEntry(
    transport: ConnectionTransport,
    activityForeground: boolean,
    previousBluetoothAudioOutput: boolean | null | undefined,
    currentBluetoothAudioOutput: boolean | null | undefined
  ): boolean {
    return (
      !activityForeground &&
      this.enteredBluetoothAudioPriority(
        transport,
        previousBluetoothAudioOutput,
        currentBluetoothAudioOutput
      )
    );
  },

  allowsPassiveRequests(
    transport: ConnectionTransport,
    activityForeground: boolean,
    bluetoothAudioOutput?: boolean | null
  ): boolean {
    return (
      !this.requiresBluetoothAudioPriority(transport, bluetoothAudioOutput) ||
      activityForeground
    );
  },

  allowsActionReconciliation(
    transport: ConnectionTransport,
    activityForeground: boolean,
    bluetoothAudioOutput?: boolean | null
  ): boolean {
    return (
      this.requiresBluetoothAudioPriority(transport, bluetoothAudioOutput) &&
      !activityForeground
    );
  },

  statusPollInterval(
    transport: ConnectionTransport,
    wifiIntervalMs: number,
    bluetoothAudioOutput?: boolean | null
  ): number {
    return this.requiresBluetoothAudioPriority(transport, bluetoothAudioOutput)
      ? this.STATUS_POLL_INTERVAL_MS
      : wifiIntervalMs;
  },

  queuePollInterval(
    transport: ConnectionTransport,
    isQueueScreenVisible: boolean,
    wifiIntervalMs: number,
    bluetoothAudioOutput?: boolean | null
  ): number | null {
    if (!this.requiresBluetoothAudioPriority(transport, bluetoothAudioOutput)) {
      return wifiIntervalMs;
    }
    return isQueueScreenVisible ? this.QUEUE_POLL_INTERVAL_MS : null;
  },

  allowsArtworkRequest(
    transport: ConnectionTransport,
    isPlaying: boolean,
    bluetoothAudioOutput?: boolean | null
  ): boolean {
    return (
      !this.requiresBluetoothAudioPriority(transport, bluetoothAudioOutput) ||
      !isPlaying
    );
  },

  artworkMinIntervalMs(
    transport: ConnectionTransport,
    bluetoothAudioOutput?: boolean | null
  ): number {
    return this.requiresBluetoothAudioPriority(transport, bluetoothAudioOutput)
      ? this.ARTWORK_MIN_INTERVAL_MS
      : 0;
  },
};

/**
 * Returns catalog work in user-visible priority order while preserving manifest order for ties.
 */
export function prioritizeCatalogItems<T>(
  items: T[],
  priorityKeys: string[],
  keyOf: (item: T) => string
): T[] {
  const priority = new Map<string, number>();
  priorityKeys.forEach((key, index) => {
    if (!priority.has(key)) {
      priority.set(key, index);
    }
  });

  return items
    .map((value, index) => ({ value, index }))
    .sort((a, b) => {
      const pA = priority.has(keyOf(a.value)) ? priority.get(keyOf(a.value))! : Number.MAX_SAFE_INTEGER;
      const pB = priority.has(keyOf(b.value)) ? priority.get(keyOf(b.value))! : Number.MAX_SAFE_INTEGER;
      if (pA !== pB) return pA - pB;
      return a.index - b.index;
    })
    .map((wrapped) => wrapped.value);
}

export function matchesStoredCatalogSnapshot(
  probedLibraryId: string,
  probedRevision: string,
  probedTotal: number,
  storedLibraryId: string | null | undefined,
  storedRevision: string | null | undefined,
  storedTotal: number,
  storedSongCount: number
): boolean {
  return (
    Boolean(probedLibraryId && probedRevision) &&
    probedLibraryId === storedLibraryId &&
    probedRevision === storedRevision &&
    probedTotal === storedTotal &&
    storedSongCount === storedTotal
  );
}

export function canFinishCatalogSyncFromSnapshot(
  forceManifestRefresh: boolean,
  manifestComplete: boolean,
  pendingCoverCount: number
): boolean {
  return !forceManifestRefresh && manifestComplete && pendingCoverCount === 0;
}
