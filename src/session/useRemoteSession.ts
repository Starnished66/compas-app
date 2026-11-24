import { useState } from 'react';
import type { RemoteAction, RemoteUiState } from '../data/types';
import { useI18n } from '../i18n';
import { createCatalogAdoption } from './catalogAdoption';
import { createCatalogSync } from './catalogSync';
import { useConnectionDiscoveryEffects } from './connectionDiscoveryEffects';
import { createPlaybackActions } from './playbackActions';
import { useRemoteActionDispatcher } from './remoteActionDispatch';
import { createInitialSessionState } from './remoteSessionState';
import { useConnectionLifecycle } from './useConnectionLifecycle';
import { useLazyRef } from './useLazyRef';
import { useLibraryBrowser } from './useLibraryBrowser';
import { useRemoteQueue } from './useRemoteQueue';
import { useSessionArtwork } from './useSessionArtwork';
import { useSessionEdits } from './useSessionEdits';
import { useSessionEffects } from './useSessionEffects';
import { useSessionRefs, type SessionState } from './useSessionRefs';
import { useStatusPolling } from './useStatusPolling';
import { useWifiImport } from './useWifiImport';

function useSessionOwners(shared: SessionState, t: ReturnType<typeof useI18n>['t']) {
  // The callbacks between owners run after composition. They capture this render's owners.
  const artwork = useSessionArtwork(shared, (id) => library.libraryTarget(id));
  const { adoptCatalog, markCatalogUnavailable, recoverCatalogBrowse } = createCatalogAdoption({
    shared, clearArtworkState: artwork.clearArtworkState,
  });
  const { startCatalogSync } = createCatalogSync({
    shared, adoptCatalog, markCatalogUnavailable,
    restartCatalogBrowse: (...args) => library.restartCatalogBrowse(...args),
  });
  const queue = useRemoteQueue({
    shared, artworkSources: artwork.artworkSources,
    abandonBulkProgress: (action) => edits.abandonBulkProgress(action),
  });
  const library = useLibraryBrowser({
    shared, t, startCatalogSync, recoverCatalogBrowse,
    refreshQueue: queue.refreshQueue,
    loadLibraryArtwork: artwork.loadLibraryArtwork,
  });
  const edits = useSessionEdits({
    shared, browsePlaylist: library.browsePlaylist, libraryRow: library.libraryRow, libraryTarget: library.libraryTarget,
    loadLibraryCategory: library.loadLibraryCategory,
    revalidateRatingAlbums: library.revalidateRatingAlbums,
    refreshQueue: queue.refreshQueue,
    reconcileQueueAfterWrite: queue.reconcileQueueAfterWrite,
    ownsCurrentPlayer: artwork.ownsCurrentPlayer,
  });
  const wifi = useWifiImport({
    shared, startCatalogSync,
    loadLibraryCategory: library.loadLibraryCategory,
    refreshQueue: queue.refreshQueue,
    tryUpgradeToWifi: (...args) => connection.tryUpgradeToWifi(...args),
  });
  const polling = useStatusPolling({
    shared,
    loadLibraryArtwork: artwork.loadLibraryArtwork,
    nowPlayingArtwork: artwork.nowPlayingArtwork,
    refreshLibrarySorting: library.refreshLibrarySorting,
    stopSearchReads: library.stopSearchReads,
    refreshQueue: queue.refreshQueue, refreshQueueIfChanged: queue.refreshQueueIfChanged,
    currentRatingEdit: edits.currentRatingEdit,
    wifiUpgradeScanCleanupRef: wifi.wifiUpgradeScanCleanupRef,
    runPinCooldown: (...args) => connection.runPinCooldown(...args),
    scheduleAutoReconnect: (...args) => connection.scheduleAutoReconnect(...args),
    pauseForBluetoothPairing: (error) => connection.pauseForBluetoothPairing(error),
    wifiUpgradeBlocked: () => connection.wifiUpgradeBlocked(),
    tryUpgradeToWifi: (...args) => connection.tryUpgradeToWifi(...args),
  });
  const connection = useConnectionLifecycle({ shared, startCatalogSync, wifi, artwork, library, queue, polling, edits });
  return { wifi, library, queue, polling, connection, edits };
}

function sessionResult(
  shared: SessionState, state: RemoteUiState, onAction: (action: RemoteAction) => Promise<void>,
  wifi: ReturnType<typeof useWifiImport>,
) {
  return {
    state,
    onAction,
    wifiImportStatus: wifi.wifiImportStatus,
    wifiImportOwnerKey: wifi.wifiImportOwnerKeyRef.current,
    ...wifi.commands,
    playbackPosition: shared.positionStoreRef.current,
    catalogSyncProgress: shared.catalogSyncProgress,
    currentLibraryCategory: shared.currentLibraryCategoryRef.current,
    libraryArtwork: shared.libraryArtwork,
    playerSettingsApi: () => shared.apiRef.current?.settings() ?? null,
    playerPluginsApi: () => shared.apiRef.current?.plugins() ?? null,
    takeScreenshot: async () => {
      const api = shared.apiRef.current;
      if (!api) throw new Error('Connect to a player first.');
      await api.takeScreenshot();
    },
  };
}

export function useRemoteSession() {
  const { t } = useI18n();
  const [state, setState] = useState(createInitialSessionState());
  const shared = useSessionRefs(state, setState);
  const { wifi, library, queue, polling, connection, edits } = useSessionOwners(shared, t);
  const handlers = useLazyRef(() => ({
    ...connection.connectionActions, ...library.navigationActions,
    ...createPlaybackActions({ ...shared, ...edits, ...polling }).playbackActions,
    ...library.libraryActions, ...queue.queueActions, ...edits.libraryEditActions,
  })).current;
  const onAction = useRemoteActionDispatcher({
    shared, handlers, ownsPicker: connection.ownsPicker,
  });

  useSessionEffects({
    shared, state, onAction,
    scheduleAutoReconnect: connection.scheduleAutoReconnect,
    runAutoReconnect: connection.runAutoReconnect,
    unmountSession: connection.unmountSession,
    startPollingLoop: polling.startPollingLoop,
    reconcileAfterMediaAction: polling.reconcileAfterMediaAction,
    wifiUpgradeScanCleanupRef: wifi.wifiUpgradeScanCleanupRef,
  });
  useConnectionDiscoveryEffects({ shared, state, ...connection.discovery });

  return sessionResult(shared, state, onAction, wifi);
}
