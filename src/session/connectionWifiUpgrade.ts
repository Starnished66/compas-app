import type { useQueuePages } from './useQueuePages';
import type { createLibraryLists } from './libraryLists';
import type { SessionState } from './useSessionRefs';
import { EMPTY_QUEUE_STATE } from './queueTargets';
import { PREF_WIFI_ADDRESS, PREF_LAST_TRANSPORT } from './sessionPreferences';
import { normalizedVolume, trackFromStatus } from './sessionPlayback';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  PlaybackStatus,
  ConnectionStatus,
  ConnectionTransport,
  WifiImportStatus,
} from '../data/types';
import { RemoteEndpoint } from '../data/RemoteEndpoint';
import { RemoteApi } from '../data/RemoteApi';
import { createWifiTransport } from '../data/wifiTransport';
import { fromNumeric } from './playbackModes';
import { readPublicLibraryIdentity, verifyPublicWifiIdentity, verifyWifiUpgradeIdentity } from './wifiUpgradeIdentity';
import { ratingFromStatus } from './trackRating';
import { BluetoothRequestPolicy } from './BluetoothRequestPolicy';
import { getRequiredPermissionsForWifi, checkPermissions } from './PermissionPolicy';

interface ConnectionWifiUpgradeDependencies extends
  Pick<ReturnType<typeof createLibraryLists>, 'loadLibraryCategory'>,
  Pick<ReturnType<typeof useQueuePages>, 'refreshQueue'> {
  shared: Pick<SessionState,
    'activeCatalogRef' | 'apiRef' | 'appForegroundRef' | 'bluetoothAudioOutputRef' | 'bulkActionBusyRef'
    | 'bulkSelectionsRef' | 'collectionPendingRef' | 'collectionStartingRef' | 'connectedPlayerKeyRef'
    | 'connectionAttemptRef' | 'currentLibraryCategoryRef' | 'currentTrackRef' | 'featureSetRef'
    | 'gateRef' | 'lastConnectionTransportRef' | 'lastPlayerKeyRef' | 'lastQueueRefreshAtRef'
    | 'libraryBackStackRef' | 'libraryContextRef' | 'libraryEntriesRef' | 'libraryListCacheRef'
    | 'pendingSeekRef' | 'pendingVolumeRef' | 'pinStoreRef' | 'positionStoreRef' | 'searchReads'
    | 'setState' | 'shownLibraryListRef' | 'songActionTargetRef' | 'sortingWriteRef' | 'stateRef'
  >;
  activeWifiEndpointRef: React.RefObject<string | null>;
  clearArtworkState: () => void;
  closeSongActions: () => void;
  setWifiImportStatus: React.Dispatch<React.SetStateAction<WifiImportStatus>>;
  startCatalogSync: (api: RemoteApi, attempt: number, features: string[], refreshCoversManifest?: boolean) => Promise<void>;
  startPollingLoop: (immediate?: boolean) => void;
  stopPolling: () => void;
  waitForStatusPoll: () => Promise<void>;
  wifiImportOperationRef: React.RefObject<number>;
}

const wifiUpgradeBlocked = (deps: ConnectionWifiUpgradeDependencies) => {
  const {
    bulkActionBusyRef, bulkSelectionsRef, collectionPendingRef, collectionStartingRef,
    sortingWriteRef,
  } = deps.shared;
  return collectionStartingRef.current || collectionPendingRef.current || sortingWriteRef.current ||
    bulkActionBusyRef.current || bulkSelectionsRef.current.size > 0;
};

const authenticateWifiCandidate = async (
  deps: ConnectionWifiUpgradeDependencies,
  currentApi: RemoteApi, candidate: RemoteApi, currentPlayerKey: string | null,
  endpoint: string, explicit: boolean, expectedIdentity: NonNullable<Awaited<ReturnType<typeof readPublicLibraryIdentity>>>,
  savedPin: string | null, canContinue: () => boolean, sourceReadAllowed: () => Promise<boolean>,
) => {
  const { pinStoreRef } = deps.shared;
  const playerKey = endpoint;
  try {
    const caps = await candidate.capabilities({ omitPin: true });
    if (caps.version !== 1 || !caps.libraryId || !canContinue() || !caps.features.includes(RemoteApi.CATALOG_SYNC_FEATURE) ||
        (explicit && (!caps.features.includes('wifi_import') || !caps.features.includes('wifi_import_files')))) return false;
    if (!(await verifyPublicWifiIdentity(currentApi, caps.libraryId, expectedIdentity, sourceReadAllowed))) return false;
    const { libraryId } = caps;
    let revision: string | null = null;
    const verify = (pin: string | null) => verifyWifiUpgradeIdentity(currentApi, candidate, libraryId, pin,
      canContinue, sourceReadAllowed, (matchingRevision) => { revision = matchingRevision; });
    let identityMatches = await verify(savedPin);
    if (!canContinue()) return false;
    let sourcePin: string | null = null;
    if (!identityMatches && explicit) {
      sourcePin = currentPlayerKey ? await pinStoreRef.current.get(currentPlayerKey) : null;
      if (sourcePin && sourcePin !== savedPin) {
        identityMatches = await verify(sourcePin);
      }
    }
    if (!identityMatches || !canContinue()) return false;
    const status = await candidate.status();
    if (!canContinue() || wifiUpgradeBlocked(deps)) return false;
    if (sourcePin && sourcePin !== savedPin) await pinStoreRef.current.put(playerKey, sourcePin);
    if (!canContinue() || wifiUpgradeBlocked(deps)) return false;

    commitWifiUpgrade(deps, currentApi, candidate, playerKey, endpoint, revision, status, caps.features);
    return true;
  } catch {
    return false;
  }
};

const tryUpgradeToWifi = async (
  deps: ConnectionWifiUpgradeDependencies,
  currentApi: RemoteApi,
  candidateAddress?: string,
  explicit: boolean = false,
  isStillRequested: () => boolean = () => true,
  expectedPublicLibraryId?: string,
): Promise<boolean> => {
  const {
    apiRef, appForegroundRef, bluetoothAudioOutputRef, connectedPlayerKeyRef,
    connectionAttemptRef, featureSetRef, pinStoreRef, stateRef,
  } = deps.shared;
  const { waitForStatusPoll } = deps;
  const attempt = connectionAttemptRef.current;
  const currentPlayerKey = connectedPlayerKeyRef.current;
  const canContinue = () => isStillRequested() && apiRef.current === currentApi &&
    connectionAttemptRef.current === attempt && connectedPlayerKeyRef.current === currentPlayerKey &&
    stateRef.current.connectionStatus === ConnectionStatus.Connected &&
    stateRef.current.connectionTransport === ConnectionTransport.Bluetooth &&
    (explicit || BluetoothRequestPolicy.allowsPassiveRequests(
      ConnectionTransport.Bluetooth, appForegroundRef.current, bluetoothAudioOutputRef.current));
  if (!canContinue() || !featureSetRef.current.has(RemoteApi.CATALOG_SYNC_FEATURE) || wifiUpgradeBlocked(deps)) return false;
  // Reads over Bluetooth wait for any status read in flight, then recheck the route it reported.
  const sourceReadAllowed = async () => {
    await waitForStatusPoll();
    return canContinue();
  };
  const savedAddress = candidateAddress ?? await AsyncStorage.getItem(PREF_WIFI_ADDRESS);
  if (!canContinue() || !savedAddress?.trim()) return false;
  const wifiPerms = getRequiredPermissionsForWifi();
  if (wifiPerms.length > 0 && !(await checkPermissions(wifiPerms))) return false;
  if (!canContinue()) return false;
  const expectedIdentity = expectedPublicLibraryId
    ? { libraryId: expectedPublicLibraryId, revision: currentApi.catalogRevision }
    : await readPublicLibraryIdentity(currentApi, false, sourceReadAllowed);
  if (!canContinue() || !expectedIdentity) return false;

  let endpoint: string;
  try {
    endpoint = RemoteEndpoint.normalizeWifiAddress(savedAddress);
  } catch {
    return false;
  }
  const playerKey = endpoint;
  const candidate = new RemoteApi(createWifiTransport(endpoint, 5000));
  const savedPin = await pinStoreRef.current.get(playerKey);
  if (!canContinue()) return false;

  return authenticateWifiCandidate(deps,
    currentApi, candidate, currentPlayerKey, endpoint, explicit, expectedIdentity, savedPin, canContinue, sourceReadAllowed,
  );
};

const publishWifiSnapshot = (
  { positionStoreRef, setState, featureSetRef, currentTrackRef }: ConnectionWifiUpgradeDependencies['shared'],
  status: PlaybackStatus, features: string[],
) => {
  positionStoreRef.current.set(status.positionSeconds * 1000, status.durationSeconds * 1000);
  setState((prev) => ({
    ...prev,
    connectionStatus: ConnectionStatus.Connected,
    connectionTransport: ConnectionTransport.Wifi,
    connectionMessage: null,
    isPlaying: status.playing && !status.paused,
    dacMode: status.dacMode ?? 'none',
    volume: normalizedVolume(status.volume),
    currentTrack: trackFromStatus(status, status.durationSeconds * 1000),
    playbackMode: fromNumeric(status.playMode, featureSetRef.current.has('shuffle_modes')),
    currentRating: ratingFromStatus(status, features.includes('ratings_edit')),
    supportedFeatures: features,
    playerAccentColor: features.includes('player_accent') ? status.accentColor ?? null : null,
    deviceModel: features.includes('device_info') ? status.deviceModel ?? null : null,
    playerVersion: features.includes('device_info') ? status.playerVersion ?? null : null,
  }));
  currentTrackRef.current = trackFromStatus(status, status.durationSeconds * 1000);
};

const commitWifiUpgrade = (
  deps: ConnectionWifiUpgradeDependencies,
  currentApi: RemoteApi, candidate: RemoteApi, playerKey: string, endpoint: string, revision: string | null,
  status: PlaybackStatus, features: string[],
) => {
  const {
    activeCatalogRef, apiRef, bluetoothAudioOutputRef, connectedPlayerKeyRef,
    connectionAttemptRef, currentLibraryCategoryRef, featureSetRef,
    gateRef, lastConnectionTransportRef, lastPlayerKeyRef, lastQueueRefreshAtRef,
    libraryBackStackRef, libraryContextRef, libraryEntriesRef, libraryListCacheRef, pendingSeekRef,
    pendingVolumeRef, searchReads, setState, shownLibraryListRef, songActionTargetRef,
  } = deps.shared;
  const {
    activeWifiEndpointRef, clearArtworkState, closeSongActions, loadLibraryCategory,
    refreshQueue, setWifiImportStatus, startCatalogSync, startPollingLoop, stopPolling,
    wifiImportOperationRef,
  } = deps;
  currentApi.preemptArtworkRequest();
  searchReads.invalidateGroups();
  if (connectedPlayerKeyRef.current !== playerKey) {
    activeCatalogRef.current = null;
    clearArtworkState();
    libraryEntriesRef.current.clear();
    if (songActionTargetRef.current && (!revision || (candidate.catalogRevision ?? revision) !== revision ||
      songActionTargetRef.current.sourceRevision !== revision)) closeSongActions();
    libraryListCacheRef.current.clear();
    libraryBackStackRef.current = [];
    libraryContextRef.current = null;
    shownLibraryListRef.current = null;
    setState((prev) => ({ ...prev, libraryEntries: [], ...EMPTY_QUEUE_STATE, libraryIsNested: false }));
  }
  stopPolling();
  apiRef.current = candidate;
  pendingSeekRef.current = null;
  pendingVolumeRef.current = null;
  connectedPlayerKeyRef.current = playerKey;
  lastPlayerKeyRef.current = playerKey;
  activeWifiEndpointRef.current = endpoint;
  wifiImportOperationRef.current++;
  setWifiImportStatus({ state: 'stopped', error: null });
  featureSetRef.current = new Set(features);
  bluetoothAudioOutputRef.current = null;
  lastQueueRefreshAtRef.current = Date.now();
  gateRef.current.reset();
  AsyncStorage.setItem(PREF_LAST_TRANSPORT, 'wifi').catch(() => {});
  lastConnectionTransportRef.current = ConnectionTransport.Wifi;
  AsyncStorage.setItem(PREF_WIFI_ADDRESS, endpoint).catch(() => {});
  publishWifiSnapshot(deps.shared, status, features);
  refreshQueue(candidate);
  loadLibraryCategory(currentLibraryCategoryRef.current, candidate);
  startCatalogSync(candidate, connectionAttemptRef.current, features);
  // A Bluetooth poll in flight during the swap returns without rescheduling.
  startPollingLoop();
};

export function createConnectionWifiUpgrade(deps: ConnectionWifiUpgradeDependencies) {
  return {
    wifiUpgradeBlocked: wifiUpgradeBlocked.bind(undefined, deps),
    tryUpgradeToWifi: tryUpgradeToWifi.bind(undefined, deps),
  };
}
