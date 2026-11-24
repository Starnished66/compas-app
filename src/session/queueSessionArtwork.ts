import type { SessionState } from './useSessionRefs';
import type { RemoteTrack } from '../data/types';
import { RemoteApi } from '../data/RemoteApi';
import { applyQueueArtwork, QUEUE_ARTWORK_FLUSH_MS } from './queueArtwork';
import { ArtworkSources } from './artworkResolver';
import { BluetoothRequestPolicy } from './BluetoothRequestPolicy';

interface QueueSessionArtworkDependencies {
  shared: Pick<SessionState,
    'appForegroundRef' | 'bluetoothAudioOutputRef' | 'queueArtworkBySongRef'
    | 'queueArtworkFlushTimerRef' | 'queueArtworkLoader' | 'queueArtworkPendingRef' | 'queueTargetsRef'
    | 'setState' | 'stateRef' | 'syncedCatalogStoreRef'
  >;
  artworkSources: (network: RemoteApi | null) => ArtworkSources;
}

const allowsQueueArtworkRequests = (deps: QueueSessionArtworkDependencies) => {
  const { appForegroundRef, bluetoothAudioOutputRef, stateRef } = deps.shared;
  const transport = stateRef.current.connectionTransport;
  const audioOutput = bluetoothAudioOutputRef.current;
  return (
    BluetoothRequestPolicy.allowsPassiveRequests(transport, appForegroundRef.current, audioOutput) &&
    BluetoothRequestPolicy.allowsArtworkRequest(transport, stateRef.current.isPlaying, audioOutput) &&
    !BluetoothRequestPolicy.requiresBluetoothAudioPriority(transport, audioOutput)
  );
};

const loadQueueArtwork = (deps: QueueSessionArtworkDependencies, songIndexes: number[], api: RemoteApi, retry = false) => {
  const { artworkSources } = deps;
  const { queueArtworkBySongRef, queueArtworkLoader, queueArtworkPendingRef, syncedCatalogStoreRef } = deps.shared;
  const sources = artworkSources(api);
  const catalog = sources.catalog;
  void queueArtworkLoader.load(songIndexes, { sources, fileUris: queueArtworkBySongRef.current,
    readAlbumKeys: async (pending) => catalog
      ? syncedCatalogStoreRef.current.albumKeysForSongs(catalog.libraryId, catalog.revision, pending).catch(() => null)
      : null,
    allowsNetwork: allowsQueueArtworkRequests.bind(undefined, deps),
    publish: (index, reference) => {
      if (typeof reference === 'string') queueArtworkBySongRef.current.set(index, reference);
      queueArtworkPendingRef.current.set(index, reference);
      scheduleQueueArtworkFlush(deps);
    },
  }, retry);
};

// Covers resolve one by one; applying each with its own state update re-rendered the whole app
// (and every visible queue row) up to 25 times per page. Apply them together instead.
const scheduleQueueArtworkFlush = (deps: QueueSessionArtworkDependencies) => {
  const { queueArtworkFlushTimerRef, queueArtworkPendingRef, queueTargetsRef, setState } = deps.shared;
  if (queueArtworkFlushTimerRef.current) return;
  queueArtworkFlushTimerRef.current = setTimeout(() => {
    queueArtworkFlushTimerRef.current = null;
    const resolved = queueArtworkPendingRef.current;
    if (!resolved.size) return;
    queueArtworkPendingRef.current = new Map();
    setState((prev) => {
      const artworkFor = (track: RemoteTrack) => {
        const songIndex = queueTargetsRef.current.get(track.id)?.songIndex;
        return songIndex == null ? undefined : resolved.get(songIndex);
      };
      const queue = applyQueueArtwork(prev.queue, artworkFor);
      const queuePlayed = prev.queuePlayed ? applyQueueArtwork(prev.queuePlayed, artworkFor) : prev.queuePlayed;
      return queue === prev.queue && queuePlayed === prev.queuePlayed ? prev : { ...prev, queue, queuePlayed };
    });
  }, QUEUE_ARTWORK_FLUSH_MS);
};

export function createQueueSessionArtwork(deps: QueueSessionArtworkDependencies) {
  return {
    loadQueueArtwork: loadQueueArtwork.bind(undefined, deps),
  };
}
