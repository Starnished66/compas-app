import { createConnectionSetup } from './connectionSetup';
import { createConnectionTeardown } from './connectionTeardown';
import { useConnectionAttempts } from './connectionAttempts';
import { createConnectionWifiUpgrade } from './connectionWifiUpgrade';
import { createConnectionDiscovery } from './connectionDiscovery';
import { createConnectionActions } from './connectionActions';
import { useLazyRef } from './useLazyRef';
import type { createCatalogSync } from './catalogSync';
import type { useLibraryBrowser } from './useLibraryBrowser';
import type { useRemoteQueue } from './useRemoteQueue';
import type { useSessionArtwork } from './useSessionArtwork';
import type { useSessionEdits } from './useSessionEdits';
import type { SessionState } from './useSessionRefs';
import type { useStatusPolling } from './useStatusPolling';
import type { useWifiImport } from './useWifiImport';

type ConnectionLifecycleDependencies = {
  shared: SessionState;
  wifi: Pick<ReturnType<typeof useWifiImport>,
    'activeWifiEndpointRef' | 'setWifiImportStatus' | 'wifiImportOperationRef' |
    'wifiImportOwnerKeyRef' | 'wifiUpgradeScanCleanupRef'
  >;
  library: Pick<ReturnType<typeof useLibraryBrowser>, 'loadLibraryCategory' | 'stopSearchReads'>;
  queue: Pick<ReturnType<typeof useRemoteQueue>, 'refreshQueue'>;
  artwork: Pick<ReturnType<typeof useSessionArtwork>, 'nowPlayingArtwork' | 'clearArtworkState'>;
  edits: Pick<ReturnType<typeof useSessionEdits>, 'currentRatingEdit' | 'closeSongActions'>;
  polling: Pick<ReturnType<typeof useStatusPolling>, 'startPollingLoop' | 'stopPolling' | 'waitForStatusPoll'>;
} & ReturnType<typeof createCatalogSync>;

export function useConnectionLifecycle({
  shared, startCatalogSync,
  wifi: { activeWifiEndpointRef, setWifiImportStatus, wifiImportOperationRef, wifiImportOwnerKeyRef, wifiUpgradeScanCleanupRef },
  library: { loadLibraryCategory, stopSearchReads },
  queue: { refreshQueue },
  artwork: { nowPlayingArtwork, clearArtworkState },
  edits: { currentRatingEdit, closeSongActions },
  polling: { startPollingLoop, stopPolling, waitForStatusPoll },
}: ConnectionLifecycleDependencies) {
  const discovery = createConnectionDiscovery(shared);
  const { ownsPicker, stopPickerDiscovery, startWifiDiscovery, startBluetoothDiscovery } = discovery;
  const { commitConnection } = createConnectionSetup({
    shared, activeWifiEndpointRef, clearArtworkState, closeSongActions, loadLibraryCategory, refreshQueue,
    setWifiImportStatus, startCatalogSync, startPollingLoop, wifiImportOperationRef, wifiImportOwnerKeyRef,
  });
  const { disconnect, dropLiveSession, unmountSession } = createConnectionTeardown({
    shared, activeWifiEndpointRef, closeSongActions, currentRatingEdit, nowPlayingArtwork,
    setWifiImportStatus, stopPickerDiscovery, stopPolling, stopSearchReads, wifiImportOperationRef,
    wifiImportOwnerKeyRef, wifiUpgradeScanCleanupRef,
  });
  const attempts = useConnectionAttempts({
    shared, activeWifiEndpointRef, commitConnection, dropLiveSession, nowPlayingArtwork,
    setWifiImportStatus, stopPolling, wifiImportOperationRef,
  });
  const upgrade = createConnectionWifiUpgrade({
    shared, activeWifiEndpointRef, clearArtworkState, closeSongActions, loadLibraryCategory, refreshQueue,
    setWifiImportStatus, startCatalogSync, startPollingLoop, stopPolling, waitForStatusPoll,
    wifiImportOperationRef,
  });
  const actions = useLazyRef(() => createConnectionActions({
    shared, connect: attempts.connect, disconnect, scheduleAutoReconnect: attempts.scheduleAutoReconnect,
    startBluetoothDiscovery, startWifiDiscovery,
  })).current;

  return {
    ...attempts,
    ...upgrade,
    ...actions,
    unmountSession,
    ownsPicker,
    discovery,
  };
}
