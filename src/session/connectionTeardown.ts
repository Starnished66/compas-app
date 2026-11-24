import type { useSessionRating } from './useSessionRating';
import type { SessionState } from './useSessionRefs';
import { ConnectionStatus, WifiImportStatus } from '../data/types';
import { clearMediaState, stopPlaybackService } from '../../modules/compas-media-session/src/index';
import { EMPTY_QUEUE_STATE } from './queueTargets';
import type { NowPlayingArtwork } from './NowPlayingArtwork';

interface ConnectionTeardownDependencies extends
  Pick<ReturnType<typeof useSessionRating>, 'currentRatingEdit'> {
  shared: Pick<SessionState,
    'activeCatalogRef' | 'apiRef' | 'autoReconnectGenerationRef' | 'autoReconnectTimerRef'
    | 'bluetoothAudioOutputRef' | 'bulkActionCancelledRef' | 'bulkSelectionsRef'
    | 'catalogCoversByAlbumRef' | 'catalogSyncGenerationRef' | 'collectionPendingRef'
    | 'collectionStartTokenRef' | 'collectionStartingRef' | 'connectedPlayerKeyRef'
    | 'connectionAttemptRef' | 'featureSetRef' | 'gateRef' | 'lastPlayerKeyRef' | 'libraryArtwork'
    | 'libraryBackStackRef' | 'libraryEntriesRef' | 'libraryListCacheRef' | 'librarySortingRef'
    | 'mountedRef' | 'pendingSeekRef' | 'pendingVolumeRef' | 'pinCooldownTimerRef'
    | 'queueArtworkBySongRef' | 'queueArtworkFlushTimerRef' | 'queueArtworkPendingRef'
    | 'queuePageGenerationRef' | 'queueRefreshGenerationRef' | 'queueRefreshRef' | 'queueTargetsRef'
    | 'setState' | 'shownLibraryListRef' | 'sortingRefreshAtRef' | 'syncedCoverUriCacheRef'
  >;
  activeWifiEndpointRef: React.RefObject<string | null>;
  closeSongActions: () => void;
  nowPlayingArtwork: NowPlayingArtwork;
  setWifiImportStatus: React.Dispatch<React.SetStateAction<WifiImportStatus>>;
  stopPickerDiscovery: () => void;
  stopPolling: () => void;
  stopSearchReads: (keepVerified?: boolean) => void;
  wifiImportOperationRef: React.RefObject<number>;
  wifiImportOwnerKeyRef: React.RefObject<string | null>;
  wifiUpgradeScanCleanupRef: React.RefObject<(() => void) | null>;
}

const clearDisconnectedContent = (deps: ConnectionTeardownDependencies) => {
  const {
    activeCatalogRef, catalogCoversByAlbumRef, libraryArtwork, libraryBackStackRef,
    libraryEntriesRef, libraryListCacheRef, queueArtworkBySongRef, queueArtworkPendingRef,
    queueTargetsRef, shownLibraryListRef, syncedCoverUriCacheRef,
  } = deps.shared;
  const { closeSongActions, nowPlayingArtwork } = deps;
  activeCatalogRef.current = null;
  catalogCoversByAlbumRef.current = new Map();
  syncedCoverUriCacheRef.current = new Map();
  queueArtworkBySongRef.current.clear();
  queueArtworkPendingRef.current.clear();
  libraryEntriesRef.current.clear();
  closeSongActions();
  libraryBackStackRef.current = [];
  libraryListCacheRef.current.clear();
  shownLibraryListRef.current = null;
  libraryArtwork.clear();
  nowPlayingArtwork.reset();
  queueTargetsRef.current.clear();
};

const publishDisconnected = (setState: SessionState['setState']) => {
  setState((prev) => ({
    ...prev,
    connectionStatus: ConnectionStatus.Disconnected,
    connectionAttemptTransport: null,
    connectionMessage: null,
    currentTrack: null,
    isPlaying: false,
    supportedFeatures: [],
    librarySorting: null,
    collectionBusy: false,
    bulkActionProgress: null,
    playerAccentColor: null,
    deviceModel: null,
    playerVersion: null,
    currentRating: 0,
    pendingCurrentRating: undefined,
    ...EMPTY_QUEUE_STATE,
    libraryEntries: [],
  }));
};

const disconnect = (deps: ConnectionTeardownDependencies) => {
  const {
    apiRef, autoReconnectGenerationRef, autoReconnectTimerRef, bluetoothAudioOutputRef,
    bulkActionCancelledRef, bulkSelectionsRef, collectionPendingRef, collectionStartTokenRef,
    collectionStartingRef, connectedPlayerKeyRef, connectionAttemptRef, featureSetRef, gateRef,
    lastPlayerKeyRef, librarySortingRef, pendingSeekRef, pendingVolumeRef,
    queuePageGenerationRef, queueRefreshGenerationRef, queueRefreshRef, setState,
    sortingRefreshAtRef,
  } = deps.shared;
  const {
    activeWifiEndpointRef, currentRatingEdit, setWifiImportStatus, stopPolling,
    stopSearchReads, wifiImportOperationRef, wifiImportOwnerKeyRef,
  } = deps;
  currentRatingEdit.cancel();
  stopSearchReads(false);
  autoReconnectGenerationRef.current++;
  bulkActionCancelledRef.current = true;
  bulkSelectionsRef.current.clear();
  connectionAttemptRef.current++;
  queueRefreshGenerationRef.current++;
  queuePageGenerationRef.current++;
  queueRefreshRef.current = null;
  pendingSeekRef.current = null;
  pendingVolumeRef.current = null;
  stopPolling();
  if (autoReconnectTimerRef.current) {
    clearTimeout(autoReconnectTimerRef.current);
    autoReconnectTimerRef.current = null;
  }
  apiRef.current = null;
  activeWifiEndpointRef.current = null;
  wifiImportOperationRef.current++;
  setWifiImportStatus({ state: 'stopped', error: null });
  featureSetRef.current.clear();
  sortingRefreshAtRef.current = 0;
  librarySortingRef.current = null;
  collectionPendingRef.current = null;
  collectionStartingRef.current = false;
  collectionStartTokenRef.current++;
  gateRef.current.reset();
  connectedPlayerKeyRef.current = null;
  lastPlayerKeyRef.current = null;
  wifiImportOwnerKeyRef.current = null;
  bluetoothAudioOutputRef.current = null;
  clearDisconnectedContent(deps);

  clearMediaState().catch(() => {});
  stopPlaybackService().catch(() => {});
  publishDisconnected(setState);
};

const unmountSession = (deps: ConnectionTeardownDependencies) => {
  const {
    apiRef, autoReconnectGenerationRef, autoReconnectTimerRef, bulkSelectionsRef,
    catalogSyncGenerationRef, connectionAttemptRef, libraryArtwork, mountedRef,
    pinCooldownTimerRef, queueArtworkFlushTimerRef,
  } = deps.shared;
  const {
    currentRatingEdit, nowPlayingArtwork, stopPickerDiscovery, stopPolling, stopSearchReads,
    wifiImportOperationRef, wifiUpgradeScanCleanupRef,
  } = deps;
  mountedRef.current = false;
  currentRatingEdit.cancel();
  stopPolling();
  apiRef.current = null;
  bulkSelectionsRef.current.clear();
  connectionAttemptRef.current++;
  autoReconnectGenerationRef.current++;
  catalogSyncGenerationRef.current++;
  wifiImportOperationRef.current++;
  wifiUpgradeScanCleanupRef.current?.();
  if (pinCooldownTimerRef.current) clearInterval(pinCooldownTimerRef.current);
  clearTimeout(autoReconnectTimerRef.current);
  autoReconnectTimerRef.current = null;
  if (queueArtworkFlushTimerRef.current) clearTimeout(queueArtworkFlushTimerRef.current);
  stopSearchReads(false);
  nowPlayingArtwork.reset();
  libraryArtwork.dispose();
  stopPickerDiscovery();
};

// The previous session can't be resumed once a new attempt replaced its attempt number.
const dropLiveSession = (deps: ConnectionTeardownDependencies) => {
  const {
    apiRef, bulkSelectionsRef,
  } = deps.shared;
  const { currentRatingEdit, stopPolling, stopSearchReads } = deps;
  if (!apiRef.current) return;
  currentRatingEdit.cancel();
  stopSearchReads(false);
  apiRef.current = null;
  bulkSelectionsRef.current.clear();
  stopPolling();
};

export function createConnectionTeardown(deps: ConnectionTeardownDependencies) {
  return {
    disconnect: disconnect.bind(undefined, deps),
    unmountSession: unmountSession.bind(undefined, deps),
    dropLiveSession: dropLiveSession.bind(undefined, deps),
  };
}
