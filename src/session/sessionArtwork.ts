import type { SessionState } from './useSessionRefs';
import { sameCatalogRevision } from './librarySnapshot';
import { ConnectionTransport, LibraryEntry } from '../data/types';
import { RemoteApi } from '../data/RemoteApi';
import { ArtworkSources, artworkTarget, cachedAlbumArtwork, resolveArtworkReference } from './artworkResolver';
import { EntryTarget } from './LibraryEntryFactory';
import { BluetoothRequestPolicy } from './BluetoothRequestPolicy';
import type { NowPlayingArtwork } from './NowPlayingArtwork';

interface SessionArtworkDependencies {
  shared: Pick<SessionState,
    'activeCatalogRef' | 'apiRef' | 'appForegroundRef' | 'artCacheRef' | 'bluetoothAudioOutputRef'
    | 'bulkSelectionsRef' | 'catalogCoversByAlbumRef' | 'connectedPlayerKeyRef'
    | 'connectionAttemptRef' | 'currentTrackRef' | 'deferredBluetoothArtworkEntryIdsRef' | 'gateRef'
    | 'lastBluetoothArtworkAtRef' | 'libraryArtwork' | 'libraryBackStackRef' | 'libraryEntriesRef'
    | 'queueArtworkBySongRef' | 'queueArtworkPendingRef' | 'setState' | 'stateRef'
    | 'syncedCoverStoreRef' | 'syncedCoverUriCacheRef'
  >;
  libraryTarget: (id: string) => EntryTarget | undefined;
  nowPlayingArtwork: NowPlayingArtwork;
}

const clearArtworkState = ({ shared, nowPlayingArtwork }: SessionArtworkDependencies) => {
  const {
    bulkSelectionsRef, catalogCoversByAlbumRef, currentTrackRef, libraryArtwork,
    libraryBackStackRef, libraryEntriesRef, queueArtworkBySongRef,
    queueArtworkPendingRef, setState, syncedCoverUriCacheRef,
  } = shared;
  libraryEntriesRef.current = libraryEntriesRef.current.nextSource();
  bulkSelectionsRef.current = new Map();
  catalogCoversByAlbumRef.current = new Map();
  syncedCoverUriCacheRef.current = new Map();
  queueArtworkBySongRef.current.clear();
  queueArtworkPendingRef.current.clear();
  libraryArtwork.clear();
  nowPlayingArtwork.reset();
  const withoutArtwork = (entry: LibraryEntry) => libraryEntriesRef.current.copyTarget(entry, { ...entry, artwork: null });
  libraryBackStackRef.current = libraryBackStackRef.current.map((snapshot) => ({
    ...snapshot,
    entries: snapshot.entries.map(withoutArtwork),
  }));
  currentTrackRef.current = currentTrackRef.current
    ? { ...currentTrackRef.current, artwork: null }
    : null;
  setState((prev) => ({
    ...prev,
    currentTrack: prev.currentTrack ? { ...prev.currentTrack, artwork: null } : null,
    queue: prev.queue.map((track) => ({ ...track, artwork: null, artworkReference: undefined })),
    libraryEntries: prev.libraryEntries.map(withoutArtwork),
  }));
};

const loadLibraryArtwork = (deps: SessionArtworkDependencies, id: string) => {
  const { libraryArtwork } = deps.shared;
  return libraryArtwork.load(id, (recovery) => resolveLibraryArtwork(deps, id, recovery));
};

const resolveLibraryArtwork = async (deps: SessionArtworkDependencies, entryId: string, recovery?: symbol): Promise<void> => {
  const { libraryTarget, shared } = deps;
  const {
    apiRef, appForegroundRef, bluetoothAudioOutputRef, deferredBluetoothArtworkEntryIdsRef, gateRef,
    lastBluetoothArtworkAtRef, libraryArtwork, stateRef,
  } = shared;
  const target = libraryTarget(entryId);
  if (!target) return libraryArtwork.releaseRequest(entryId);
  const artwork = artworkTarget(target, libraryArtwork.playlistTarget);
  if (!artwork.albumKey && artwork.songIndex == null) return libraryArtwork.releaseRequest(entryId);
  const playlistKey = target.type === 'Playlist' ? target.playlist.key : undefined;
  const sources = artworkSources(deps, apiRef.current);
  const cached = artwork.albumKey && cachedAlbumArtwork(artwork.albumKey, sources);
  if (cached) return libraryArtwork.queue(entryId, cached, artwork, playlistKey);
  const transport = stateRef.current.connectionTransport;
  const audioPriority = BluetoothRequestPolicy.requiresBluetoothAudioPriority(
    transport,
    bluetoothAudioOutputRef.current
  );
  if (
    !BluetoothRequestPolicy.allowsPassiveRequests(transport, appForegroundRef.current, bluetoothAudioOutputRef.current) ||
    !BluetoothRequestPolicy.allowsArtworkRequest(transport, stateRef.current.isPlaying, bluetoothAudioOutputRef.current) ||
    (audioPriority && (!gateRef.current.confirmedPaused || !appForegroundRef.current))
  ) {
    if (transport === ConnectionTransport.Bluetooth && !deferredBluetoothArtworkEntryIdsRef.current.includes(entryId)) {
      deferredBluetoothArtworkEntryIdsRef.current.push(entryId);
      if (deferredBluetoothArtworkEntryIdsRef.current.length > 64) deferredBluetoothArtworkEntryIdsRef.current.shift();
    }
    return;
  }
  if (audioPriority) {
    const minInterval = BluetoothRequestPolicy.artworkMinIntervalMs(transport, bluetoothAudioOutputRef.current);
    const remaining = lastBluetoothArtworkAtRef.current + minInterval - Date.now();
    if (remaining > 0) {
      if (!deferredBluetoothArtworkEntryIdsRef.current.includes(entryId)) {
        deferredBluetoothArtworkEntryIdsRef.current.push(entryId);
      }
      return;
    }
    lastBluetoothArtworkAtRef.current = Date.now();
  }
  const ownsArtwork = () => {
    const current = libraryTarget(entryId);
    const next = current && artworkTarget(current, libraryArtwork.playlistTarget);
    return next?.albumKey === artwork.albumKey && next.songIndex === artwork.songIndex;
  };
  const isCurrent = () => sources.isCurrent?.() && libraryArtwork.ownsRecovery(entryId, recovery);
  const uri = await resolveArtworkReference(artwork, { ...sources, isCurrent: () => Boolean(isCurrent() && ownsArtwork()) });
  if (!isCurrent()) return libraryArtwork.releaseRecovery(entryId, recovery);
  if (!ownsArtwork()) return resolveLibraryArtwork(deps, entryId, recovery);
  if (uri) libraryArtwork.queue(entryId, uri, artwork, playlistKey);
  else libraryArtwork.releaseRecovery(entryId, recovery);
};

const ownsCurrentPlayer = ({ shared }: SessionArtworkDependencies) => {
  const { apiRef, connectedPlayerKeyRef, connectionAttemptRef } = shared;
  const api = apiRef.current, attempt = connectionAttemptRef.current, player = connectedPlayerKeyRef.current;
  return () => api === apiRef.current && attempt === connectionAttemptRef.current && player === connectedPlayerKeyRef.current;
};

const artworkSources = (deps: SessionArtworkDependencies, network: RemoteApi | null): ArtworkSources => {
  const {
    activeCatalogRef, artCacheRef, catalogCoversByAlbumRef, connectedPlayerKeyRef,
    syncedCoverStoreRef, syncedCoverUriCacheRef,
  } = deps.shared;
  const ownsPlayer = ownsCurrentPlayer(deps), catalog = activeCatalogRef.current;
  const coversByAlbum = catalogCoversByAlbumRef.current, coverUrisByAlbum = syncedCoverUriCacheRef.current;
  return {
    catalog, coverUrisByAlbum, coversByAlbum, coverStore: syncedCoverStoreRef.current,
    artCache: artCacheRef.current, network, playerScope: connectedPlayerKeyRef.current,
    isCurrent: () => ownsPlayer() && sameCatalogRevision(catalog, activeCatalogRef.current) && coversByAlbum === catalogCoversByAlbumRef.current &&
      coverUrisByAlbum === syncedCoverUriCacheRef.current,
  };
};

export function createSessionArtwork(deps: SessionArtworkDependencies) {
  return {
    clearArtworkState: clearArtworkState.bind(undefined, deps),
    loadLibraryArtwork: loadLibraryArtwork.bind(undefined, deps),
    ownsCurrentPlayer: ownsCurrentPlayer.bind(undefined, deps),
    artworkSources: artworkSources.bind(undefined, deps),
  };
}
