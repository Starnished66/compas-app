import type { useQueuePages } from './useQueuePages';
import type { createLibraryLists } from './libraryLists';
import type { SessionState } from './useSessionRefs';
import { PREF_WIFI_ADDRESS, PREF_BLUETOOTH_ID, PREF_LAST_TRANSPORT, PREF_AUTO_RECONNECT } from './sessionPreferences';
import { normalizedVolume, trackFromStatus } from './sessionPlayback';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  PlaybackStatus,
  ConnectionStatus,
  ConnectionTransport,
  WifiImportStatus,
} from '../data/types';
import { RemoteApi } from '../data/RemoteApi';
import { PIN_NOT_SAVED_MESSAGE } from '../data/SecurePinStore';
import { fromNumeric } from './playbackModes';
import { ratingFromStatus } from './trackRating';

interface ConnectionSetupDependencies extends
  Pick<ReturnType<typeof createLibraryLists>, 'loadLibraryCategory'>,
  Pick<ReturnType<typeof useQueuePages>, 'refreshQueue'> {
  shared: Pick<SessionState,
    'activeCatalogRef' | 'apiRef' | 'autoReconnectEnabledRef' | 'bluetoothAudioOutputRef'
    | 'bluetoothPairingRequiredRef' | 'bulkSelectionsRef' | 'collectionPendingRef'
    | 'collectionStartingRef' | 'connectedPlayerKeyRef' | 'currentLibraryCategoryRef'
    | 'currentTrackRef' | 'featureSetRef' | 'gateRef' | 'lastConnectionTransportRef'
    | 'lastPlayerKeyRef' | 'lastQueueRefreshAtRef' | 'libraryBackStackRef' | 'libraryContextRef'
    | 'libraryEntriesRef' | 'libraryListCacheRef' | 'playerSessionRef' | 'positionStoreRef'
    | 'setState' | 'shownLibraryListRef'
  >;
  activeWifiEndpointRef: React.RefObject<string | null>;
  clearArtworkState: () => void;
  closeSongActions: () => void;
  setWifiImportStatus: React.Dispatch<React.SetStateAction<WifiImportStatus>>;
  startCatalogSync: (api: RemoteApi, attempt: number, features: string[], refreshCoversManifest?: boolean) => Promise<void>;
  startPollingLoop: (immediate?: boolean) => void;
  wifiImportOperationRef: React.RefObject<number>;
  wifiImportOwnerKeyRef: React.RefObject<string | null>;
}

const resetLibraryForNewPlayer = (deps: ConnectionSetupDependencies, playerKey: string) => {
  const {
    activeCatalogRef, lastPlayerKeyRef, libraryBackStackRef, libraryContextRef,
    libraryEntriesRef, libraryListCacheRef, setState, shownLibraryListRef,
  } = deps.shared;
  const { clearArtworkState, closeSongActions } = deps;
  // lastPlayerKeyRef survives a dropped link, so reconnecting to the same player keeps navigation.
  if (lastPlayerKeyRef.current !== playerKey) {
    activeCatalogRef.current = null;
    clearArtworkState();
    libraryEntriesRef.current.clear();
    closeSongActions();
    libraryListCacheRef.current.clear();
    libraryBackStackRef.current = [];
    libraryContextRef.current = null;
    shownLibraryListRef.current = null;
    setState((prev) => ({ ...prev, libraryEntries: [], queue: [], libraryIsNested: false }));
  }
};

const publishConnection = (deps: ConnectionSetupDependencies, status: PlaybackStatus, transport: ConnectionTransport, features: string[], pinNotSaved: boolean) => {
  const {
    collectionPendingRef, collectionStartingRef, currentTrackRef, featureSetRef, gateRef,
    positionStoreRef, setState,
  } = deps.shared;
  const mode =
    fromNumeric(status.playMode, featureSetRef.current.has('shuffle_modes'));

  const track = trackFromStatus(status, (status.durationSeconds || 0) * 1000);

  currentTrackRef.current = track;
  positionStoreRef.current.set((status.positionSeconds || 0) * 1000, (status.durationSeconds || 0) * 1000);
  // Tokens and collection jobs from the previous link would never settle on this one.
  gateRef.current.reset();
  collectionPendingRef.current = null;
  collectionStartingRef.current = false;

  setState((prev) => ({
    ...prev,
    connectionStatus: ConnectionStatus.Connected,
    collectionBusy: false,
    connectionTransport: transport,
    connectionAttemptTransport: null,
    playerName: 'Compás Player',
    connectionMessage: pinNotSaved ? PIN_NOT_SAVED_MESSAGE : null,
    pinDialogVisible: false,
    pinInput: '',
    pinError: null,
    pinRetryDelaySeconds: 0,
    isPlaying: status.playing,
    dacMode: status.dacMode ?? 'none',
    volume: normalizedVolume(status.volume),
    playbackMode: mode,
    currentRating: ratingFromStatus(status, features.includes('ratings_edit')),
    pendingCurrentRating: undefined,
    supportedFeatures: features,
    playerAccentColor: features.includes('player_accent') ? status.accentColor ?? null : null,
    deviceModel: features.includes('device_info') ? status.deviceModel ?? null : null,
    playerVersion: features.includes('device_info') ? status.playerVersion ?? null : null,
    currentTrack: track,
  }));
};

const commitConnection = (
  deps: ConnectionSetupDependencies,
  api: RemoteApi, playerKey: string, transport: ConnectionTransport, status: PlaybackStatus,
  features: string[], attempt: number, pinNotSaved: boolean,
) => {
  const {
    apiRef, autoReconnectEnabledRef, bluetoothAudioOutputRef, bluetoothPairingRequiredRef,
    bulkSelectionsRef, connectedPlayerKeyRef, currentLibraryCategoryRef, featureSetRef,
    lastConnectionTransportRef, lastPlayerKeyRef, lastQueueRefreshAtRef, playerSessionRef,
    setState,
  } = deps.shared;
  const {
    activeWifiEndpointRef, loadLibraryCategory, refreshQueue, setWifiImportStatus,
    startCatalogSync, startPollingLoop, wifiImportOperationRef, wifiImportOwnerKeyRef,
  } = deps;
  resetLibraryForNewPlayer(deps, playerKey);
  apiRef.current = api;
  bulkSelectionsRef.current.clear();
  playerSessionRef.current++;
  featureSetRef.current = new Set(features);
  connectedPlayerKeyRef.current = playerKey;
  lastPlayerKeyRef.current = playerKey;
  wifiImportOwnerKeyRef.current = playerKey;
  activeWifiEndpointRef.current = transport === ConnectionTransport.Wifi ? playerKey : null;
  wifiImportOperationRef.current++;
  setWifiImportStatus({ state: 'stopped', error: null });
  bluetoothAudioOutputRef.current = status.bluetoothAudioOutput ?? null;
  lastQueueRefreshAtRef.current = Date.now();
  autoReconnectEnabledRef.current = true;
  lastConnectionTransportRef.current = transport;
  if (transport === ConnectionTransport.Bluetooth) bluetoothPairingRequiredRef.current = false;
  AsyncStorage.setItem(PREF_AUTO_RECONNECT, 'true').catch(() => {});

  AsyncStorage.setItem(PREF_LAST_TRANSPORT, transport === ConnectionTransport.Wifi ? 'wifi' : 'bluetooth').catch(() => {});
  if (transport === ConnectionTransport.Wifi) {
    AsyncStorage.setItem(PREF_WIFI_ADDRESS, playerKey).catch(() => {});
  } else {
    AsyncStorage.setItem(PREF_BLUETOOTH_ID, playerKey.slice(3)).catch(() => {});
  }

  publishConnection(deps, status, transport, features, pinNotSaved);
  if (pinNotSaved) {
    // The snackbar shows it once; left in state it would read as a library error.
    setTimeout(() => setState((prev) => (prev.connectionMessage === PIN_NOT_SAVED_MESSAGE ? { ...prev, connectionMessage: null } : prev)), 2000);
  }

  refreshQueue(api);
  loadLibraryCategory(currentLibraryCategoryRef.current, api);
  startPollingLoop();
  startCatalogSync(api, attempt, features);
};

export function createConnectionSetup(deps: ConnectionSetupDependencies) {
  return {
    commitConnection: commitConnection.bind(undefined, deps),
  };
}
