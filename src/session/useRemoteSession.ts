import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useI18n } from '../i18n';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import {
  RemoteUiState,
  RemoteAction,
  RemoteScreen,
  RemoteTheme,
  ConnectionStatus,
  ConnectionTransport,
  ContentStatus,
  PlaybackMode,
  LibraryCategory,
  RemoteTrack,
  LibraryEntry,
  WifiPlayer,
  BluetoothPlayer,
  Song,
  LibraryGroup,
  Playlist,
  PlayContext,
  LibraryFilter,
  LibrarySortScope,
  LibrarySortMode,
  LibrarySortingSnapshot,
  CollectionPlayRequest,
  WifiImportStatus,
  WifiImportDirectoryPage,
  BulkActionProgress,
} from '../data/types';
import { RemoteEndpoint } from '../data/RemoteEndpoint';
import { RemoteApi } from '../data/RemoteApi';
import { SerializedHttpTransport } from '../data/HttpTransport';
import { createWifiTransport } from '../data/wifiTransport';
import { SecurePinStore } from '../data/SecurePinStore';
import { ArtworkDiskCache } from '../data/ArtworkDiskCache';
import {
  SyncedCatalogStore,
  CatalogGroupKind,
  CatalogIdentity,
  StoredCatalogCover,
} from '../data/SyncedCatalogStore';
import { SyncedCoverStore } from '../data/SyncedCoverStore';
import { ArtworkSources, resolveArtworkUri } from './artworkResolver';
import { useNowPlayingArtwork } from './useNowPlayingArtwork';
import { useLazyRef } from './useLazyRef';
import { LibraryArtworkStore } from './LibraryArtworkStore';
import { EntryTarget, LibraryContext, LibraryEntryFactory } from './LibraryEntryFactory';
import { AlbumBrowseIdentity, exactAlbumBrowseKey } from './albumBrowseIdentity';
import {
  ExtensionPage,
  LibraryList,
  LibraryListCache,
  libraryListKey,
  needsRevalidation,
} from './LibraryListCache';
import {
  CategoryLoadContext,
  LIBRARY_PAGE_SIZE,
  libraryGroupFromCatalog,
  loadCategoryList,
  loadSongsAfter,
  songFromCatalog,
} from './libraryCategoryLoader';
import { reconcileEntries } from './reconcileEntries';
import {
  matchesStoredCatalogSnapshot,
  canFinishCatalogSyncFromSnapshot,
} from './CatalogSyncPolicy';
import { PlaybackStatusGate, CommandOutcome } from './PlaybackStatusGate';
import { QUEUE_PROBE_SIZE, insertedOffset, queueEnds } from './queueInsertion';
import { PlaybackPositionStore } from './PlaybackPositionStore';
import { BulkWriteCounts, queueInsertWindowMatches, queueInsertionOffsets, queueRemovalAmbiguousAt, queueRemovalMatches, readQueueSnapshot, resolveBulkSongs, runPlaylistCreationJob, runSerialBulkWrites, waitForQueueTransition } from './bulkActions';
import { collectionJobSettled } from './collectionJobState';
import { buildCollectionPlaybackRequest } from './collectionPlaybackRequest';
import { fromNumeric, toNumeric, isShuffleMode, toggleShuffleMode, toggleRepeatMode } from './playbackModes';
import { discoveryEndpoint } from './wifiDiscovery';
import { publicLibraryIdentityMatches, verifyWifiUpgradeIdentity } from './wifiUpgradeIdentity';
import { isCurrentWifiImportSession } from './wifiImportSession';
import { wifiImportErrorMessage } from './wifiImportError';
import { loadServerOrderedAlbumGroups } from './librarySorting';
import { playlistNameIssue } from '../ui/playlistName';
import { withPolledPlayback } from './polledPlayback';
import { useMediaSessionSync } from './useMediaSessionSync';
import { BluetoothRequestPolicy } from './BluetoothRequestPolicy';
import {
  BluetoothTransport,
  getBondedDevices,
  startDiscovery as startBtDiscovery,
  stopDiscovery as stopBtDiscovery,
  pairDevice as pairBtDevice,
  addDeviceFoundListener as addBtDeviceFoundListener,
  addBondStateListener as addBtBondStateListener,
  addDiscoveryFinishedListener as addBtDiscoveryFinishedListener,
} from '../../modules/compas-bluetooth/src/index';
import {
  startDiscovery as startWifiDiscoveryModule,
  stopDiscovery as stopWifiDiscoveryModule,
  addDeviceFoundListener as addWifiDeviceFoundListener,
  addDeviceLostListener as addWifiDeviceLostListener,
  DiscoveredWifiService,
} from '../../modules/compas-discovery/src/index';
import {
  clearMediaState,
  startPlaybackService,
  stopPlaybackService,
  addMediaActionListener,
  addBackgroundTickListener,
} from '../../modules/compas-media-session/src/index';
import {
  getRequiredPermissionsForAction,
  getRequiredPermissionsForBluetooth,
  getRequiredPermissionsForWifi,
  checkPermissions,
  requestMissingPermissions,
} from './PermissionPolicy';

const PREF_THEME = 'compas_pref_theme';
const THEME_PREFERENCES: Record<RemoteTheme, string> = {
  [RemoteTheme.Dark]: 'dark',
  [RemoteTheme.Light]: 'light',
  [RemoteTheme.System]: 'system',
};

function themeFromPreference(saved: string | null): RemoteTheme {
  if (saved === 'dark') return RemoteTheme.Dark;
  if (saved === 'light') return RemoteTheme.Light;
  return RemoteTheme.System;
}
const PREF_WIFI_ADDRESS = 'compas_pref_wifi_address';
const PREF_BLUETOOTH_ID = 'compas_pref_bt_id';
const PREF_LAST_TRANSPORT = 'compas_pref_last_transport';
const PREF_AUTO_RECONNECT = 'compas_pref_auto_reconnect';
// Backoff before re-running a failed catalog sync; after the last one the failure is shown.
const CATALOG_SYNC_RETRY_DELAYS_MS = [2000, 5000, 15000];
const MEDIA_ACTION_RECONCILE_DELAY_MS = 1200;
const QUEUE_ARTWORK_FLUSH_MS = 120;
const SWIPE_NEXT_ATTEMPTS = 8;
const SWIPE_NEXT_POLL_MS = 200;
// In the background the poll only keeps the notification current.
const BACKGROUND_STATUS_POLL_MS = 5000;
const QUEUE_REFRESHING_MESSAGE = 'The queue changed. It is being refreshed.';

// Socket and HTTP errors from the transports are developer text; show the user what to check instead.
const connectFailureMessage = (err: any, transport: ConnectionTransport): string => {
  if (err?.message === 'Unsupported Compás protocol version') return 'This player’s Compás version isn’t supported. Update the app and the player.';
  return transport === ConnectionTransport.Bluetooth
    ? 'Could not reach the player over Bluetooth. Make sure it’s on, nearby and has Remote Control enabled.'
    : 'Could not reach the player on this network. Make sure it’s on, on the same Wi-Fi and has Remote Control enabled.';
};

const normalizedVolume = (value: number | null | undefined): number =>
  Number.isFinite(value) ? Math.max(0, Math.min(1, value as number)) : 0.68;

interface QueueTarget {
  offset: number;
  revision: number;
  songIndex: number;
}

interface LibrarySnapshot {
  sortEpoch: number;
  category: LibraryCategory;
  entries: LibraryEntry[];
  query: string;
  status: ContentStatus;
  countLabel?: string | null;
  hasMore: boolean;
  isNested: boolean;
  nestedTitle?: string | null;
  context: LibraryContext | null;
  total: number;
  page: { filter: LibraryFilter; playContext: PlayContext; albumKey: string | null; albumIdentity?: AlbumBrowseIdentity } | null;
  extensionPage: ExtensionPage | null;
  listKey: string | null;
  activePlaylist: Playlist | null;
  playlistRevision: string | null;
  folderPath: string;
  folderRoot: string;
}

export function useRemoteSession() {
  const { t } = useI18n();
  const [state, setState] = useState<RemoteUiState>({
    screen: { type: 'Home' },
    theme: RemoteTheme.System,
    connectionStatus: ConnectionStatus.Disconnected,
    connectionTransport: ConnectionTransport.Wifi,
    selectedConnectionTransport: ConnectionTransport.Wifi,
    wifiAddress: '',
    wifiPlayers: [],
    wifiDiscoveryStatus: ContentStatus.Ready,
    bluetoothPlayers: [],
    selectedBluetoothPlayerId: null,
    bluetoothScanStatus: ContentStatus.Ready,
    playerName: 'Compás Player',
    connectionMessage: null,
    pinDialogVisible: false,
    pinInput: '',
    pinError: null,
    pinRetryDelaySeconds: 0,
    currentTrack: null,
    isPlaying: false,
    volume: 0.68,
    playbackMode: PlaybackMode.RepeatAll,
    currentFavorite: false,
    supportedFeatures: [],
    queue: [],
    queueTotal: 0,
    queueHasMore: false,
    queueLoadingMore: false,
    libraryEntries: [],
    catalogSyncMessage: null,
    libraryStatus: ContentStatus.Ready,
    queueStatus: ContentStatus.Ready,
    libraryQuery: '',
    libraryCountLabel: null,
    libraryHasMore: false,
    libraryIsNested: false,
    libraryNestedTitle: null,
    songActionsVisible: false,
    songActionTitle: '',
    playlistOptions: [],
    playlistOptionsStatus: ContentStatus.Ready,
    songActionFavorite: null,
    songActionPosition: null,
    playlistTrackCount: 0,
    activePlaylist: null,
    playlistRevision: null,
    folderPath: '',
    folderRoot: 'sd',
    bluetoothArtworkRefreshGeneration: 0,
    catalogArtworkRefreshGeneration: 0,
    bulkActionProgress: null,
    bulkPlaylistOptions: [],
    bulkPlaylistOptionsStatus: ContentStatus.Ready,
  });

  const apiRef = useRef<RemoteApi | null>(null);
  const connectedPlayerKeyRef = useRef<string | null>(null);
  const lastPlayerKeyRef = useRef<string | null>(null);
  // Stable owner token for UI work that spans an identity-verified BT → Wi-Fi upgrade.
  const wifiImportOwnerKeyRef = useRef<string | null>(null);
  const activeWifiEndpointRef = useRef<string | null>(null);
  const wifiImportOperationRef = useRef(0);
  const [wifiImportStatus, setWifiImportStatus] = useState<WifiImportStatus>({ state: 'stopped', error: null });
  const wifiUpgradeScanCleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => () => { bulkActionCancelledRef.current = true; }, []);
  const gateRef = useLazyRef(() => new PlaybackStatusGate());
  const positionStoreRef = useLazyRef(() => new PlaybackPositionStore());
  const pinStoreRef = useLazyRef(() => new SecurePinStore());
  const artCacheRef = useLazyRef(() => new ArtworkDiskCache());
  const syncedCatalogStoreRef = useLazyRef(() => new SyncedCatalogStore());
  const syncedCoverStoreRef = useLazyRef(() => new SyncedCoverStore());

  const activeCatalogRef = useRef<CatalogIdentity | null>(null);
  const catalogCoversByAlbumRef = useRef<Map<string, StoredCatalogCover>>(new Map());
  const syncedCoverUriCacheRef = useRef<Map<string, string>>(new Map());

  const libraryEntriesRef = useLazyRef(
    () =>
      new LibraryEntryFactory({
        coverUri: (albumKey) => syncedCoverUriCacheRef.current.get(albumKey),
        activeRevision: () => activeCatalogRef.current?.revision ?? null,
      }),
  );
  const libraryListCacheRef = useLazyRef(() => new LibraryListCache());
  const shownLibraryListRef = useRef<string | null>(null);
  const queueTargetsRef = useRef<Map<string, QueueTarget>>(new Map());
  const queueArtworkBySongRef = useRef<Map<number, string>>(new Map());
  const entryIdCounterRef = useRef<number>(0);

  const screenBackStackRef = useRef<RemoteScreen[]>([]);
  const libraryBackStackRef = useRef<LibrarySnapshot[]>([]);
  const libraryContextRef = useRef<LibraryContext | null>(null);
  const libraryPageRef = useRef<LibrarySnapshot['page']>(null);
  const extensionPageRef = useRef<LibrarySnapshot['extensionPage']>(null);
  const activePlaylistRef = useRef<Playlist | null>(null);
  const featureSetRef = useRef<Set<string>>(new Set());
  const libraryPageLoadingRef = useRef(false);
  const libraryPageLoadTokenRef = useRef(0);
  const currentLibraryCategoryRef = useRef<LibraryCategory>(LibraryCategory.Artists);
  const searchReturnCategoryRef = useRef<LibraryCategory>(LibraryCategory.Artists);
  const libraryLoadGenerationRef = useRef(0);
  const queueRevisionRef = useRef<number>(0);
  const queueRefreshGenerationRef = useRef(0);
  const queuePageGenerationRef = useRef(0);
  const queueRefreshInFlightRef = useRef(false);
  const songActionEntryIdRef = useRef<string | null>(null);
  const songActionTargetRef = useRef<Extract<EntryTarget, { type: 'Song' }> | null>(null);
  const songActionBusyRef = useRef(false);
  const bulkActionRunRef = useRef(0);
  const bulkActionBusyRef = useRef(false);
  const bulkActionCancelledRef = useRef(false);

  const connectionAttemptRef = useRef<number>(0);
  const catalogSyncGenerationRef = useRef<number>(0);
  const librarySortingRef = useRef<LibrarySortingSnapshot | null>(null);
  const sortingEpochRef = useRef(0);
  const sortingRefreshAtRef = useRef(0);
  const sortingWriteRef = useRef(false);
  const collectionPendingRef = useRef<{ id: number; api: RemoteApi; attempt: number; startedAt: number } | null>(null);
  const collectionStartTokenRef = useRef(0);
  const collectionStartingRef = useRef(false);
  const wifiDiscoveryGenerationRef = useRef(0);
  const wifiDiscoverySourcesRef = useRef(new Map<string, string>());
  const wifiDiscoveryProbesRef = useRef(new Set<string>());
  const pollingTimerRef = useRef<any>(null);
  const pollLoopTokenRef = useRef(0);
  const reconcileOnceRef = useRef(false);
  const reconcileTimerRef = useRef<any>(null);
  const queueArtworkPendingRef = useRef(new Map<number, string>());
  const queueArtworkFlushTimerRef = useRef<any>(null);
  const pinCooldownTimerRef = useRef<any>(null);
  const autoReconnectTimerRef = useRef<any>(null);
  const autoReconnectEnabledRef = useRef<boolean>(true);
  const searchDebounceTimerRef = useRef<any>(null);

  const wifiAddressEditedRef = useRef<boolean>(false);
  const lastNonShuffleModeRef = useRef<PlaybackMode>(PlaybackMode.RepeatAll);
  const currentTrackRef = useRef<RemoteTrack | null>(null);
  const latestPlayingRef = useRef<boolean>(false);
  const bluetoothAudioOutputRef = useRef<boolean | null>(null);
  const appForegroundRef = useRef(AppState.currentState === 'active');
  const autoReconnectDueAtRef = useRef(0);
  const lastQueueRefreshAtRef = useRef(0);
  const lastWifiProbeAtRef = useRef(0);
  const lastBluetoothArtworkAtRef = useRef(0);
  const lastCatalogCoverProgressAtRef = useRef(0);
  const deferredBluetoothArtworkEntryIdsRef = useRef<string[]>([]);
  const pendingSeekRef = useRef<{
    positionMs: number;
    startedAtMs: number;
    commandCompletedAtMs: number | null;
  } | null>(null);
  const pendingVolumeRef = useRef<{
    volume: number;
    commandCompletedAtMs: number | null;
    expiresAtMs: number;
  } | null>(null);
  const [libraryArtwork] = useState(() => new LibraryArtworkStore());

  const stateRef = useRef(state);
  stateRef.current = state;

  const nowPlayingArtwork = useNowPlayingArtwork(currentTrackRef, setState, {
    sources: () => artworkSources(null),
    catalogStore: syncedCatalogStoreRef.current,
    api: () => apiRef.current,
    onRemoteRequest: () => {
      if (BluetoothRequestPolicy.requiresBluetoothAudioPriority(stateRef.current.connectionTransport, bluetoothAudioOutputRef.current)) {
        lastBluetoothArtworkAtRef.current = Date.now();
      }
    },
  });

  useEffect(() => {
    latestPlayingRef.current = state.isPlaying;
  }, [state.isPlaying]);

  const nextEntryId = (prefix: string): string => `${prefix}-${++entryIdCounterRef.current}`;

  // Restore stored preferences
  useEffect(() => {
    (async () => {
      try {
        const [savedTheme, savedWifi, savedBt, savedTransport, savedAuto] = await Promise.all([
          AsyncStorage.getItem(PREF_THEME),
          AsyncStorage.getItem(PREF_WIFI_ADDRESS),
          AsyncStorage.getItem(PREF_BLUETOOTH_ID),
          AsyncStorage.getItem(PREF_LAST_TRANSPORT),
          AsyncStorage.getItem(PREF_AUTO_RECONNECT),
        ]);

        const autoReconnect = savedAuto !== 'false';
        autoReconnectEnabledRef.current = autoReconnect;

        setState((prev) => ({
          ...prev,
          theme: themeFromPreference(savedTheme),
          wifiAddress: savedWifi || prev.wifiAddress,
          selectedBluetoothPlayerId: savedBt || prev.selectedBluetoothPlayerId,
          selectedConnectionTransport:
            savedTransport === 'bluetooth' ? ConnectionTransport.Bluetooth : ConnectionTransport.Wifi,
        }));

        if (autoReconnect && (savedWifi || savedBt)) {
          scheduleAutoReconnect(500);
        }
      } catch {}
    })();
  }, []);

  // Listen to Android MediaSession controls
  useEffect(() => {
    const sub = addMediaActionListener((evt) => {
      switch (evt.action) {
        case 'play':
          if (!latestPlayingRef.current) {
            latestPlayingRef.current = true;
            onAction({ type: 'Play' });
          }
          break;
        case 'pause':
          if (latestPlayingRef.current) {
            latestPlayingRef.current = false;
            onAction({ type: 'Pause' });
          }
          break;
        case 'toggle':
          latestPlayingRef.current = !latestPlayingRef.current;
          onAction({ type: 'TogglePlayback' });
          break;
        case 'next':
          onAction({ type: 'Next' });
          break;
        case 'previous':
          onAction({ type: 'Previous' });
          break;
        case 'seekTo':
          if (evt.positionMs != null) {
            onAction({ type: 'SeekTo', positionMs: evt.positionMs });
          }
          break;
        case 'setVolume':
          if (evt.volume != null) {
            onAction({ type: 'SetVolume', volume: evt.volume });
          }
          break;
      }
      // An ignored play/pause means our state is stale too, so reconcile either way.
      if (['play', 'pause', 'toggle', 'next', 'previous'].includes(evt.action)) reconcileAfterMediaAction();
    });

    return () => {
      sub?.remove();
    };
  }, []);

  useMediaSessionSync(state, positionStoreRef.current);

  // Clean up timers
  useEffect(() => {
    return () => {
      if (pollingTimerRef.current) clearTimeout(pollingTimerRef.current);
      if (pinCooldownTimerRef.current) clearInterval(pinCooldownTimerRef.current);
      if (autoReconnectTimerRef.current) clearTimeout(autoReconnectTimerRef.current);
      if (reconcileTimerRef.current) clearTimeout(reconcileTimerRef.current);
      if (queueArtworkFlushTimerRef.current) clearTimeout(queueArtworkFlushTimerRef.current);
      if (searchDebounceTimerRef.current) clearTimeout(searchDebounceTimerRef.current);
      libraryArtwork.dispose();
      wifiDiscoveryGenerationRef.current++;
      wifiDiscoverySourcesRef.current.clear();
      stopWifiDiscoveryModule().catch(() => {});
      stopBtDiscovery().catch(() => {});
    };
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      const wasForeground = appForegroundRef.current;
      appForegroundRef.current = nextState === 'active';
      // The background poll runs slowly; catch up right away when the app comes back.
      if (!wasForeground && appForegroundRef.current && apiRef.current && stateRef.current.connectionStatus === ConnectionStatus.Connected) {
        startPollingLoop();
      }
    });
    return () => sub.remove();
  }, []);

  // JS timers stop in the background, so the playback service's tick drives the poll and
  // any reconnect that is due there.
  useEffect(() => {
    const sub = addBackgroundTickListener(() => {
      if (appForegroundRef.current) return;
      if (autoReconnectTimerRef.current && Date.now() >= autoReconnectDueAtRef.current) {
        clearTimeout(autoReconnectTimerRef.current);
        void runAutoReconnect();
        return;
      }
      if (!apiRef.current || stateRef.current.connectionStatus !== ConnectionStatus.Connected) return;
      startPollingLoop(true);
    });
    return () => sub?.remove();
  }, []);

  useEffect(() => {
    if (state.connectionStatus !== ConnectionStatus.Connected || state.connectionTransport !== ConnectionTransport.Bluetooth) {
      wifiUpgradeScanCleanupRef.current?.();
      wifiUpgradeScanCleanupRef.current = null;
    }
  }, [state.connectionStatus, state.connectionTransport]);

  // Manage discovery based on screen
  useEffect(() => {
    if (state.screen.type === 'Connection') {
      if (state.selectedConnectionTransport === ConnectionTransport.Wifi) {
        startWifiDiscovery();
      } else {
        loadBondedBluetoothDevices();
      }
    } else {
      wifiDiscoveryGenerationRef.current++;
      wifiDiscoverySourcesRef.current.clear();
      stopWifiDiscoveryModule().catch(() => {});
      stopBtDiscovery().catch(() => {});
    }
  }, [state.screen.type, state.selectedConnectionTransport]);

  // Bluetooth event subscriptions
  useEffect(() => {
    const dSub = addBtDeviceFoundListener((evt) => {
      if (evt.verified !== true || !evt.name?.trim() || evt.name.trim().toLowerCase() === evt.id.toLowerCase()) return;
      setState((prev) => {
        const existing = prev.bluetoothPlayers.find((p) => p.id === evt.id);
        if (existing) {
          return {
            ...prev,
            bluetoothPlayers: prev.bluetoothPlayers.map((p) =>
              p.id === evt.id ? { ...p, name: evt.name, paired: evt.paired } : p
            ),
          };
        }
        return {
          ...prev,
          bluetoothPlayers: [
            ...prev.bluetoothPlayers,
            { id: evt.id, name: evt.name, paired: evt.paired, bonding: false },
          ],
        };
      });
    });

    const bSub = addBtBondStateListener((evt) => {
      setState((prev) => ({
        ...prev,
        bluetoothPlayers: prev.bluetoothPlayers.map((p) =>
          p.id === evt.id ? { ...p, paired: evt.paired, bonding: evt.bonding } : p
        ),
      }));
    });

    const fSub = addBtDiscoveryFinishedListener(() => {
      setState((prev) => ({
        ...prev,
        bluetoothScanStatus: prev.bluetoothPlayers.length > 0 ? ContentStatus.Ready : ContentStatus.Empty,
      }));
    });

    return () => {
      dSub?.remove();
      bSub?.remove();
      fSub?.remove();
    };
  }, []);

  // Only verified, source-derived endpoints enter the device picker. Generation
  // ownership prevents late NSD/UDP replies from reviving an abandoned scan.
  useEffect(() => {
    const found = addWifiDeviceFoundListener((service: DiscoveredWifiService) => {
      const address = discoveryEndpoint(service);
      if (!address || stateRef.current.screen.type !== 'Connection' || stateRef.current.selectedConnectionTransport !== ConnectionTransport.Wifi) return;
      const generation = wifiDiscoveryGenerationRef.current;
      if (wifiDiscoverySourcesRef.current.size >= 64 && !wifiDiscoverySourcesRef.current.has(service.id)) return;
      wifiDiscoverySourcesRef.current.set(service.id, address);
      if (wifiDiscoveryProbesRef.current.has(address)) return;
      if (wifiDiscoveryProbesRef.current.size >= 32) return;
      wifiDiscoveryProbesRef.current.add(address);
      void (async () => {
        try {
          const capabilities = await new RemoteApi(createWifiTransport(address, 1500)).capabilities();
          if (capabilities.version !== 1 || !capabilities.features.includes('status') ||
              generation !== wifiDiscoveryGenerationRef.current ||
              ![...wifiDiscoverySourcesRef.current.values()].includes(address)) return;
          setState((prev) => {
            if (prev.screen.type !== 'Connection' || prev.selectedConnectionTransport !== ConnectionTransport.Wifi) return prev;
            const player: WifiPlayer = { id: `wifi:${address}`, name: service.name || 'Compás Player', address };
            const updated = prev.wifiPlayers.some((item) => item.address === address)
              ? prev.wifiPlayers.map((item) => item.address === address ? player : item)
              : [...prev.wifiPlayers, player];
            return { ...prev, wifiPlayers: updated, wifiDiscoveryStatus: ContentStatus.Ready,
              wifiAddress: !wifiAddressEditedRef.current && !prev.wifiAddress ? address : prev.wifiAddress };
          });
        } catch { /* An advertisement is not proof of a compatible player. */ }
        finally { if (generation === wifiDiscoveryGenerationRef.current) wifiDiscoveryProbesRef.current.delete(address); }
      })();
    });
    const lost = addWifiDeviceLostListener((event) => {
      const address = wifiDiscoverySourcesRef.current.get(event.id);
      wifiDiscoverySourcesRef.current.delete(event.id);
      if (address && ![...wifiDiscoverySourcesRef.current.values()].includes(address)) {
        setState((prev) => ({ ...prev, wifiPlayers: prev.wifiPlayers.filter((item) => item.address !== address) }));
      }
    });
    return () => { found?.remove(); lost?.remove(); };
  }, []);

  const loadBondedBluetoothDevices = async () => {
    const btPerms = getRequiredPermissionsForBluetooth();
    const permResult = await requestMissingPermissions(btPerms);
    if (!permResult.granted) {
      setState((prev) => ({
        ...prev,
        bluetoothPlayers: [],
        bluetoothScanStatus: ContentStatus.Error,
        connectionMessage:
          'Bluetooth permission was denied. Grant Nearby devices permission to find and connect to players.',
      }));
      return;
    }

    setState((prev) => ({ ...prev, bluetoothPlayers: [], bluetoothScanStatus: ContentStatus.Loading }));
    try {
      if (!await startBtDiscovery()) {
        setState((prev) => ({ ...prev, bluetoothScanStatus: ContentStatus.Empty }));
      }
    } catch {
      setState((prev) => ({ ...prev, bluetoothScanStatus: ContentStatus.Error }));
    }
  };

  const startWifiDiscovery = async () => {
    const generation = ++wifiDiscoveryGenerationRef.current;
    wifiDiscoverySourcesRef.current.clear();
    wifiDiscoveryProbesRef.current.clear();
    const wifiPerms = getRequiredPermissionsForWifi();
    if (wifiPerms.length > 0) {
      const permResult = await requestMissingPermissions(wifiPerms);
      if (!permResult.granted) {
        setState((prev) => ({
          ...prev,
          wifiPlayers: [],
          wifiDiscoveryStatus: ContentStatus.Error,
          connectionMessage:
            'Local network permission was denied. Grant Local Network permission to discover Wi-Fi players.',
        }));
        return;
      }
    }

    if (generation !== wifiDiscoveryGenerationRef.current || stateRef.current.screen.type !== 'Connection' || stateRef.current.selectedConnectionTransport !== ConnectionTransport.Wifi) return;
    setState((prev) => ({
      ...prev,
      wifiPlayers: [],
      wifiDiscoveryStatus: ContentStatus.Loading,
    }));
    try {
      await startWifiDiscoveryModule();
      setTimeout(() => {
        if (generation !== wifiDiscoveryGenerationRef.current) return;
        setState((prev) => {
          if (prev.wifiPlayers.length === 0 && prev.wifiDiscoveryStatus === ContentStatus.Loading) {
            return { ...prev, wifiDiscoveryStatus: ContentStatus.Empty };
          }
          return prev;
        });
      }, 4000);
    } catch {
      setState((prev) => ({ ...prev, wifiDiscoveryStatus: ContentStatus.Error }));
    }
  };

  const runPinCooldown = (seconds: number, pinInput: string = '') => {
    if (pinCooldownTimerRef.current) clearInterval(pinCooldownTimerRef.current);
    let remaining = seconds;
    setState((prev) => ({
      ...prev,
      connectionStatus: ConnectionStatus.Error,
      pinDialogVisible: true,
      pinInput,
      pinError: 'Too many attempts. Wait before entering another PIN.',
      pinRetryDelaySeconds: remaining,
      connectionMessage: `Too many PIN attempts. Try again in ${remaining}s.`,
    }));

    pinCooldownTimerRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        if (pinCooldownTimerRef.current) clearInterval(pinCooldownTimerRef.current);
        setState((prev) => ({
          ...prev,
          connectionStatus: ConnectionStatus.Error,
          pinRetryDelaySeconds: 0,
          connectionMessage: 'You can try the PIN again now.',
          pinError: null,
        }));
      } else {
        setState((prev) => ({
          ...prev,
          pinRetryDelaySeconds: remaining,
          connectionMessage: `Too many PIN attempts. Try again in ${remaining}s.`,
        }));
      }
    }, 1000);
  };

  // Connect flows
  const scheduleAutoReconnect = (initialDelayMs: number = 15000) => {
    if (!autoReconnectEnabledRef.current || autoReconnectTimerRef.current) return;
    autoReconnectDueAtRef.current = Date.now() + initialDelayMs;
    autoReconnectTimerRef.current = setTimeout(runAutoReconnect, initialDelayMs);
  };

  const runAutoReconnect = async () => {
    autoReconnectTimerRef.current = null;
    if (!autoReconnectEnabledRef.current || apiRef.current) return;
    if (stateRef.current.pinDialogVisible) {
      // Editing the PIN while a dropped link waits: try again later instead of leaving "Connecting" stuck.
      // A PIN rejection sets Error, and that wait is for the user, not for us.
      if (stateRef.current.connectionStatus === ConnectionStatus.Connecting) scheduleAutoReconnect(5000);
      return;
    }

    const savedWifi = await AsyncStorage.getItem(PREF_WIFI_ADDRESS);
    const savedBt = await AsyncStorage.getItem(PREF_BLUETOOTH_ID);

    let connected = false;
    if (savedWifi && savedWifi.trim().length > 0) {
      const wifiPerms = getRequiredPermissionsForWifi();
      const wifiOk = wifiPerms.length === 0 || (await checkPermissions(wifiPerms));
      if (wifiOk) {
        startPlaybackService('Reconnecting to player…').catch(() => {});
        try {
          connected = await connectDirect(ConnectionTransport.Wifi, savedWifi.trim());
        } catch {}
      }
    }

    if (!connected && savedBt && autoReconnectEnabledRef.current && !apiRef.current) {
      const btPerms = getRequiredPermissionsForBluetooth();
      const btOk = await checkPermissions(btPerms);
      if (btOk) {
        startPlaybackService('Reconnecting to player…').catch(() => {});
        try {
          connected = await connectDirect(ConnectionTransport.Bluetooth, undefined, savedBt);
        } catch {}
      }
    }

    if (!connected && autoReconnectEnabledRef.current && !apiRef.current && !stateRef.current.pinDialogVisible) {
      scheduleAutoReconnect(15000);
    }
  };

  // A choice rejected before connecting must not tear down a session that still works.
  const rejectConnectChoice = (message: string) => {
    if (apiRef.current && stateRef.current.connectionStatus === ConnectionStatus.Connected) {
      setState((prev) => ({ ...prev, connectionMessage: message }));
      return;
    }
    stopPlaybackService().catch(() => {});
    setState((prev) => ({ ...prev, connectionStatus: ConnectionStatus.Error, connectionMessage: message }));
  };

  // The previous session can't be resumed once a new attempt replaced its attempt number.
  const dropLiveSession = () => {
    if (!apiRef.current) return;
    apiRef.current = null;
    if (pollingTimerRef.current) clearTimeout(pollingTimerRef.current);
    pollLoopTokenRef.current++;
  };

  const connectDirect = async (
    transport: ConnectionTransport,
    wifiAddr?: string,
    btId?: string,
    explicitPin?: string
  ): Promise<boolean> => {
    if (transport === ConnectionTransport.Bluetooth) {
      const btPerms = getRequiredPermissionsForBluetooth();
      const permResult = await requestMissingPermissions(btPerms);
      if (!permResult.granted) {
        rejectConnectChoice('Bluetooth permission was denied. Grant Nearby devices permission to connect to this player.');
        return false;
      }
    } else if (transport === ConnectionTransport.Wifi) {
      const wifiPerms = getRequiredPermissionsForWifi();
      if (wifiPerms.length > 0) {
        const permResult = await requestMissingPermissions(wifiPerms);
        if (!permResult.granted) {
          rejectConnectChoice('Local network permission was denied. Grant Local Network permission to connect to this player.');
          return false;
        }
      }
    }

    let api: RemoteApi;
    let playerKey: string;

    if (transport === ConnectionTransport.Wifi) {
      const address = wifiAddr ?? stateRef.current.wifiAddress;
      if (!address || !address.trim()) return false;
      let baseUrl: string;
      try {
        baseUrl = RemoteEndpoint.normalizeWifiAddress(address);
      } catch (err: any) {
        rejectConnectChoice(err?.message || 'Enter a valid player address.');
        return false;
      }
      api = new RemoteApi(createWifiTransport(baseUrl));
      playerKey = baseUrl;
      activeWifiEndpointRef.current = null;
    } else {
      const devId = btId ?? stateRef.current.selectedBluetoothPlayerId;
      if (!devId) return false;

      // Match the native app's connect guard. Secure RFCOMM connections are only
      // supported for bonded players; attempting an unpaired address can leave
      // Android waiting on its pairing flow while the UI stays on Connecting.
      let bondedDevices: Awaited<ReturnType<typeof getBondedDevices>>;
      try {
        bondedDevices = await getBondedDevices();
      } catch (err: any) {
        rejectConnectChoice(err?.message || 'Could not check Bluetooth pairing status. Turn Bluetooth on and try again.');
        return false;
      }
      const bondedPlayer = bondedDevices.find(
        (device) => device.id.toLowerCase() === devId.toLowerCase()
      );
      if (!bondedPlayer) {
        const selectedPlayer = stateRef.current.bluetoothPlayers.find(
          (player) => player.id.toLowerCase() === devId.toLowerCase()
        );
        rejectConnectChoice(selectedPlayer
          ? `Tap Pair beside ${selectedPlayer.name}, approve Android's prompt, then try again.`
          : 'Select a paired Bluetooth player first.');
        return false;
      }
      api = new RemoteApi(new SerializedHttpTransport(new BluetoothTransport(devId)));
      playerKey = `bt:${devId}`;
    }

    // Validation is done; only now invalidate the current session's in-flight work.
    const attempt = ++connectionAttemptRef.current;
    activeWifiEndpointRef.current = null;
    wifiImportOperationRef.current++;
    setWifiImportStatus({ state: 'stopped', error: null });
    pendingSeekRef.current = null;
    pendingVolumeRef.current = null;

    setState((prev) => ({
      ...prev,
      connectionStatus: ConnectionStatus.Connecting,
      connectionAttemptTransport: transport,
      connectionMessage: 'Connecting to player…',
    }));

    startPlaybackService('Connecting to player…').catch(() => {});

    let pinToUse = explicitPin;
    if (!pinToUse) {
      pinToUse = (await pinStoreRef.current.get(playerKey)) || undefined;
    }
    if (pinToUse) {
      api.setPin(pinToUse);
    }

    try {
      const caps = await api.capabilities();
      if (caps.version !== 1) {
        throw new Error('Unsupported Compás protocol version');
      }

      const status = await api.status();
      if (attempt !== connectionAttemptRef.current) return false;

      // lastPlayerKeyRef survives a dropped link, so reconnecting to the same player keeps navigation.
      if (lastPlayerKeyRef.current !== playerKey) {
        activeCatalogRef.current = null;
        clearArtworkState();
        libraryEntriesRef.current.clear();
        libraryListCacheRef.current.clear();
        libraryBackStackRef.current = [];
        libraryContextRef.current = null;
        shownLibraryListRef.current = null;
        setState((prev) => ({ ...prev, libraryEntries: [], queue: [], libraryIsNested: false }));
      }
      apiRef.current = api;
      featureSetRef.current = new Set(caps.features);
      connectedPlayerKeyRef.current = playerKey;
      lastPlayerKeyRef.current = playerKey;
      wifiImportOwnerKeyRef.current = playerKey;
      activeWifiEndpointRef.current = transport === ConnectionTransport.Wifi ? playerKey : null;
      wifiImportOperationRef.current++;
      setWifiImportStatus({ state: 'stopped', error: null });
      bluetoothAudioOutputRef.current = status.bluetoothAudioOutput ?? null;
      lastQueueRefreshAtRef.current = Date.now();
      autoReconnectEnabledRef.current = true;
      AsyncStorage.setItem(PREF_AUTO_RECONNECT, 'true').catch(() => {});

      if (pinToUse) {
        await pinStoreRef.current.put(playerKey, pinToUse);
      }

      AsyncStorage.setItem(PREF_LAST_TRANSPORT, transport === ConnectionTransport.Wifi ? 'wifi' : 'bluetooth').catch(() => {});
      if (transport === ConnectionTransport.Wifi) {
        AsyncStorage.setItem(PREF_WIFI_ADDRESS, stateRef.current.wifiAddress).catch(() => {});
      } else if (stateRef.current.selectedBluetoothPlayerId) {
        AsyncStorage.setItem(PREF_BLUETOOTH_ID, stateRef.current.selectedBluetoothPlayerId).catch(() => {});
      }

      const mode =
        fromNumeric(status.playMode, featureSetRef.current.has('shuffle_modes'));

      const track: RemoteTrack | null = status.title
        ? {
            id: 'now_playing',
            title: status.title,
            artist: status.artist,
            album: status.album,
            duration: formatDuration((status.durationSeconds || 0) * 1000),
            codec: status.codec,
            sourceBitDepth: status.sourceBitDepth,
            sourceSampleRateHz: status.sourceSampleRateHz,
          }
        : null;

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
        connectionMessage: null,
        pinDialogVisible: false,
        pinInput: '',
        pinError: null,
        pinRetryDelaySeconds: 0,
        isPlaying: status.playing,
        volume: normalizedVolume(status.volume),
        playbackMode: mode,
        currentFavorite: !!status.favorite,
        supportedFeatures: caps.features,
        playerAccentColor: caps.features.includes('player_accent') ? status.accentColor ?? null : null,
        deviceModel: caps.features.includes('device_info') ? status.deviceModel ?? null : null,
        playerVersion: caps.features.includes('device_info') ? status.playerVersion ?? null : null,
        currentTrack: track,
      }));

      refreshQueue(api);
      loadLibraryCategory(currentLibraryCategoryRef.current, api);
      startPollingLoop();
      startCatalogSync(api, attempt, caps.features);
      return true;
    } catch (err: any) {
      if (attempt !== connectionAttemptRef.current) return false;
      dropLiveSession();
      const statusCode = err?.statusCode || err?.status;
      if (statusCode === 401) {
        if (pinToUse) await pinStoreRef.current.remove(playerKey);
        stopPlaybackService().catch(() => {});
        setState((prev) => ({
          ...prev,
          connectionStatus: ConnectionStatus.Error,
          pinDialogVisible: true,
          pinError: explicitPin ? 'Incorrect PIN. Check the player screen.' : null,
          connectionMessage: 'PIN required. Enter the PIN shown on the player.',
        }));
        return false;
      } else if (statusCode === 429 && err?.pinRateLimited) {
        const seconds = Math.max(1, Math.min(3600, Number(err.retryAfterSeconds) || 60));
        runPinCooldown(seconds, explicitPin || '');
        return false;
      } else {
        setState((prev) => ({
          ...prev,
          connectionStatus: ConnectionStatus.Error,
          connectionMessage: connectFailureMessage(err, transport),
        }));
        if (autoReconnectEnabledRef.current) {
          scheduleAutoReconnect(15000);
        } else {
          stopPlaybackService().catch(() => {});
        }
        return false;
      }
    }
  };

  const connect = (explicitPin?: string) => {
    // A pending auto-reconnect would otherwise fire mid-attempt and replace the user's choice.
    if (autoReconnectTimerRef.current) {
      clearTimeout(autoReconnectTimerRef.current);
      autoReconnectTimerRef.current = null;
    }
    connectDirect(
      stateRef.current.selectedConnectionTransport,
      stateRef.current.wifiAddress,
      stateRef.current.selectedBluetoothPlayerId ?? undefined,
      explicitPin
    );
  };

  const disconnect = () => {
    bulkActionCancelledRef.current = true;
    connectionAttemptRef.current++;
    queueRefreshGenerationRef.current++;
    queuePageGenerationRef.current++;
    queueRefreshInFlightRef.current = false;
    pendingSeekRef.current = null;
    pendingVolumeRef.current = null;
    if (pollingTimerRef.current) clearTimeout(pollingTimerRef.current);
    pollLoopTokenRef.current++;
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
    activeCatalogRef.current = null;
    catalogCoversByAlbumRef.current = new Map();
    syncedCoverUriCacheRef.current = new Map();
    queueArtworkBySongRef.current.clear();
    queueArtworkPendingRef.current.clear();
    libraryEntriesRef.current.clear();
    libraryListCacheRef.current.clear();
    shownLibraryListRef.current = null;
    libraryArtwork.clear();
    nowPlayingArtwork.reset();
    queueTargetsRef.current.clear();

    clearMediaState().catch(() => {});
    stopPlaybackService().catch(() => {});

    setState((prev) => ({
      ...prev,
      connectionStatus: ConnectionStatus.Disconnected,
      connectionAttemptTransport: null,
      connectionMessage: null,
      catalogSyncMessage: null,
      currentTrack: null,
      isPlaying: false,
      supportedFeatures: [],
      librarySorting: null,
      collectionBusy: false,
      bulkActionProgress: null,
      playerAccentColor: null,
      deviceModel: null,
      playerVersion: null,
      currentFavorite: false,
      queue: [],
      queueLoadingMore: false,
      libraryEntries: [],
    }));
  };

  const clearArtworkState = () => {
    catalogCoversByAlbumRef.current = new Map();
    syncedCoverUriCacheRef.current = new Map();
    queueArtworkBySongRef.current.clear();
    queueArtworkPendingRef.current.clear();
    libraryArtwork.clear();
    nowPlayingArtwork.reset();
    const withoutArtwork = <T extends { artwork?: string | null }>(entry: T): T => ({ ...entry, artwork: null });
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
      queue: prev.queue.map(withoutArtwork),
      libraryEntries: prev.libraryEntries.map(withoutArtwork),
    }));
  };

  const adoptCatalog = (identity: CatalogIdentity | null) => {
    const previous = activeCatalogRef.current;
    activeCatalogRef.current = identity;
    if (previous?.libraryId !== identity?.libraryId || previous?.revision !== identity?.revision) {
      libraryListCacheRef.current.clear();
      clearArtworkState();
    }
  };

  // Background Catalog Sync Worker
  const startCatalogSync = async (
    api: RemoteApi,
    attempt: number,
    features: string[],
    refreshCoversManifest: boolean = false
  ) => {
    let generation = 0;
    try {
      const supported = features.includes('catalog_sync_v1');
      if (!supported) {
        adoptCatalog(null);
        catalogCoversByAlbumRef.current = new Map();
        syncedCoverUriCacheRef.current = new Map();
        queueArtworkBySongRef.current.clear();
        queueArtworkPendingRef.current.clear();
        setState((prev) => ({ ...prev, catalogSyncMessage: null }));
        return;
      }

      generation = ++catalogSyncGenerationRef.current;
      const ownsCatalogSync = () =>
        apiRef.current === api &&
        attempt === connectionAttemptRef.current &&
        generation === catalogSyncGenerationRef.current;
      syncedCoverUriCacheRef.current = new Map();
      queueArtworkBySongRef.current.clear();
      queueArtworkPendingRef.current.clear();
      lastCatalogCoverProgressAtRef.current = 0;
      setState((prev) => ({ ...prev, catalogSyncMessage: 'Checking player library' }));

      // 1. Probe
      const probe = await catalogNetwork(api, attempt, generation, false, () => api.catalog(0, 1));
      if (!probe || apiRef.current !== api || generation !== catalogSyncGenerationRef.current || attempt !== connectionAttemptRef.current) {
        return;
      }

      // 2. Snapshot check
      const storedIdentity = await syncedCatalogStoreRef.current.activeIdentity(probe.libraryId);
      const storedSongCount = storedIdentity
        ? await syncedCatalogStoreRef.current.activeSongCount(storedIdentity.libraryId, storedIdentity.revision)
        : 0;
      if (!ownsCatalogSync()) return;

      const matches = matchesStoredCatalogSnapshot(
        probe.libraryId,
        probe.revision,
        probe.total,
        storedIdentity?.libraryId,
        storedIdentity?.revision,
        storedIdentity?.total,
        storedSongCount
      );

      if (matches && storedIdentity) {
        adoptCatalog(storedIdentity);
        const coverMap = catalogCoversByAlbumRef.current;
        const coverUriMap = syncedCoverUriCacheRef.current;
        const covers = await syncedCatalogStoreRef.current.catalogCovers(
          storedIdentity.libraryId,
          storedIdentity.revision
        );
        if (!ownsCatalogSync() || activeCatalogRef.current?.libraryId !== storedIdentity.libraryId || activeCatalogRef.current.revision !== storedIdentity.revision || catalogCoversByAlbumRef.current !== coverMap) return;
        coverMap.clear();
        covers.forEach((c) => {
          coverMap.set(c.albumKey, c);
        });

        const coverProgress = await syncedCatalogStoreRef.current.coverProgress(
          storedIdentity.libraryId,
          storedIdentity.revision
        );
        const pending = await syncedCatalogStoreRef.current.pendingCovers(
          storedIdentity.libraryId,
          storedIdentity.revision
        );
        if (!ownsCatalogSync() || activeCatalogRef.current?.libraryId !== storedIdentity.libraryId || activeCatalogRef.current.revision !== storedIdentity.revision || syncedCoverUriCacheRef.current !== coverUriMap) return;

        if (
          canFinishCatalogSyncFromSnapshot(
            refreshCoversManifest,
            coverProgress?.manifestComplete ?? false,
            pending.length
          )
        ) {
          setState((prev) => ({ ...prev, catalogSyncMessage: null }));
          return;
        }
      }

      // 3. Sync songs & covers. Pages are checkpointed, so a retry resumes where the failure left off;
      // a revision change mid-sync makes the retry restage from the player's new first page.
      for (let retry = 0; ; retry++) {
        try {
          await syncCatalogOnce(api, attempt, generation, refreshCoversManifest);
          break;
        } catch (err) {
          if (!ownsCatalogSync() || retry >= CATALOG_SYNC_RETRY_DELAYS_MS.length) throw err;
          setCatalogSyncMessage('Waiting to retry library sync');
          await new Promise<void>((resolve) => setTimeout(resolve, CATALOG_SYNC_RETRY_DELAYS_MS[retry]));
          if (!ownsCatalogSync()) return;
        }
      }
    } catch {
      if (apiRef.current === api && generation === catalogSyncGenerationRef.current && attempt === connectionAttemptRef.current) {
        setState((prev) => ({ ...prev, catalogSyncMessage: 'Library sync failed' }));
      }
    }
  };

  const catalogTransferAllowed = (optionalArtwork: boolean): boolean => {
    const transport = stateRef.current.connectionTransport;
    const route = bluetoothAudioOutputRef.current;
    if (!BluetoothRequestPolicy.allowsPassiveRequests(transport, appForegroundRef.current, route)) return false;
    if (BluetoothRequestPolicy.requiresBluetoothAudioPriority(transport, route)) {
      if (!appForegroundRef.current || !gateRef.current.confirmedPaused || stateRef.current.isPlaying) return false;
    }
    return !optionalArtwork || BluetoothRequestPolicy.allowsArtworkRequest(transport, stateRef.current.isPlaying, route);
  };

  // A bulk job that lost its player still has to leave a terminal phase, or its sheet keeps Stop forever.
  const abandonBulkProgress = (action: BulkActionProgress['action']) =>
    setState((prev) => {
      const progress = prev.bulkActionProgress;
      if (!progress || progress.action !== action || (progress.phase !== 'resolving' && progress.phase !== 'writing')) return prev;
      return {
        ...prev,
        bulkActionProgress: { ...progress, phase: 'cancelled', message: 'The connection changed. Completed changes remain applied.', messageValues: undefined },
      };
    });

  // Skips the render when the message is unchanged; the wait loop above sets it every second.
  const setCatalogSyncMessage = (message: string | null) =>
    setState((prev) => (prev.catalogSyncMessage === message ? prev : { ...prev, catalogSyncMessage: message }));

  const catalogNetwork = async <T,>(
    api: RemoteApi,
    attempt: number,
    generation: number,
    optionalArtwork: boolean,
    request: () => Promise<T>
  ): Promise<T> => {
    while (apiRef.current === api && attempt === connectionAttemptRef.current && generation === catalogSyncGenerationRef.current) {
      if (catalogTransferAllowed(optionalArtwork)) {
        if (!optionalArtwork || !BluetoothRequestPolicy.requiresBluetoothAudioPriority(
          stateRef.current.connectionTransport,
          bluetoothAudioOutputRef.current
        ) || Date.now() - lastBluetoothArtworkAtRef.current >=
          BluetoothRequestPolicy.artworkMinIntervalMs(stateRef.current.connectionTransport, bluetoothAudioOutputRef.current)) {
          if (optionalArtwork && BluetoothRequestPolicy.requiresBluetoothAudioPriority(
            stateRef.current.connectionTransport,
            bluetoothAudioOutputRef.current
          )) lastBluetoothArtworkAtRef.current = Date.now();
          return await request();
        }
      }
      setCatalogSyncMessage(BluetoothRequestPolicy.requiresBluetoothAudioPriority(
        stateRef.current.connectionTransport,
        bluetoothAudioOutputRef.current
      ) ? 'Waiting for WiFi or paused Bluetooth audio' : 'Waiting to resume library sync');
      await new Promise<void>((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error('Catalog sync no longer owns the active player session');
  };

  const syncCatalogOnce = async (
    api: RemoteApi,
    attempt: number,
    generation: number,
    refreshCoversManifest: boolean
  ) => {
    const ownsCatalogSync = () =>
      apiRef.current === api &&
      attempt === connectionAttemptRef.current &&
      generation === catalogSyncGenerationRef.current;
    setState((prev) => ({ ...prev, catalogSyncMessage: 'Syncing songs' }));
    const firstPage = await catalogNetwork(api, attempt, generation, false, () => api.catalog(0));
    if (!firstPage.libraryId || !firstPage.revision) {
      throw new Error('Player returned no catalog identity');
    }

    let identity = await syncedCatalogStoreRef.current.activeIdentity(firstPage.libraryId);
    const activeSongCount = identity
      ? await syncedCatalogStoreRef.current.activeSongCount(firstPage.libraryId, firstPage.revision)
      : 0;
    if (!ownsCatalogSync()) return;
    const activeIsComplete =
      identity?.revision === firstPage.revision &&
      identity.total === firstPage.total &&
      activeSongCount === firstPage.total;

    if (!activeIsComplete) {
      const resumeOffset = await syncedCatalogStoreRef.current.beginCatalogStage(firstPage.libraryId, firstPage.revision, firstPage.total);
      await syncedCatalogStoreRef.current.writeCatalogPage(firstPage);

      let offset = Math.max(firstPage.nextOffset, resumeOffset);
      while (offset < firstPage.total) {
        if (generation !== catalogSyncGenerationRef.current || attempt !== connectionAttemptRef.current) return;
        setState((prev) => ({
          ...prev,
          catalogSyncMessage: `Syncing songs ${Math.min(offset, firstPage.total)}/${firstPage.total}`,
        }));
        const page = await catalogNetwork(api, attempt, generation, false, () =>
          api.catalog(offset, undefined, firstPage.revision)
        );
        await syncedCatalogStoreRef.current.writeCatalogPage(page);
        offset = page.nextOffset;
      }

      await syncedCatalogStoreRef.current.publishCatalog(firstPage.libraryId, firstPage.revision, firstPage.total);
      identity = { libraryId: firstPage.libraryId, revision: firstPage.revision, total: firstPage.total };
    }

    const activeIdentity = { libraryId: firstPage.libraryId, revision: firstPage.revision, total: firstPage.total };
    if (!ownsCatalogSync()) return;
    adoptCatalog(activeIdentity);

    // Sync covers manifest
    const coverProg = await syncedCatalogStoreRef.current.coverProgress(
      activeIdentity.libraryId,
      activeIdentity.revision
    );
    if (!coverProg?.manifestComplete || refreshCoversManifest) {
      setState((prev) => ({ ...prev, catalogSyncMessage: 'Syncing album covers' }));
      const firstCovers = await catalogNetwork(api, attempt, generation, false, () =>
        api.catalogCovers(0, undefined, activeIdentity.revision)
      );
      const coverStage = await syncedCatalogStoreRef.current.beginCovers(
        activeIdentity.libraryId,
        activeIdentity.revision,
        firstCovers.total,
        refreshCoversManifest
      );
      await syncedCatalogStoreRef.current.writeCoverPage(firstCovers);

      let offset = Math.max(firstCovers.nextOffset, coverStage.nextOffset);
      while (offset < firstCovers.total) {
        if (generation !== catalogSyncGenerationRef.current || attempt !== connectionAttemptRef.current) return;
        setState((prev) => ({
          ...prev,
          catalogSyncMessage: `Syncing album covers ${Math.min(offset, firstCovers.total)}/${firstCovers.total}`,
        }));
        const page = await catalogNetwork(api, attempt, generation, false, () =>
          api.catalogCovers(offset, undefined, activeIdentity.revision)
        );
        await syncedCatalogStoreRef.current.writeCoverPage(page);
        offset = page.nextOffset;
      }

      await syncedCatalogStoreRef.current.publishCovers(
        activeIdentity.libraryId,
        activeIdentity.revision,
        firstCovers.total
      );
    }

    // Populate covers map
    const allCovers = await syncedCatalogStoreRef.current.catalogCovers(
      activeIdentity.libraryId,
      activeIdentity.revision
    );
    if (!ownsCatalogSync() || activeCatalogRef.current?.libraryId !== activeIdentity.libraryId || activeCatalogRef.current.revision !== activeIdentity.revision) return;
    const coverMap = catalogCoversByAlbumRef.current;
    const coverUriMap = syncedCoverUriCacheRef.current;
    coverMap.clear();
    allCovers.forEach((c) => {
      coverMap.set(c.albumKey, c);
    });
    // The manifest is complete here, so files for covers it no longer lists are orphans.
    const coverStore = syncedCoverStoreRef.current;
    void coverStore.pruneLibrary(activeIdentity.libraryId, allCovers.map((c) => c.coverKey)).catch(() => {});
    void syncedCatalogStoreRef.current.retainedLibraryIds().then((ids) => coverStore.purgeLibrariesExcept(ids)).catch(() => {});

    // Download pending covers
    const pending = await syncedCatalogStoreRef.current.pendingCovers(
      activeIdentity.libraryId,
      activeIdentity.revision
    );
    if (!ownsCatalogSync() || catalogCoversByAlbumRef.current !== coverMap || syncedCoverUriCacheRef.current !== coverUriMap) return;
    const downloadableTotal = allCovers.filter((c) => c.available !== false).length;
    let done = downloadableTotal - pending.length;
    // A cover cut off by a timeout or a server error gets one more try at the end of this pass.
    const requeued = new Set<string>();

    for (const cover of pending) {
      if (!ownsCatalogSync() || catalogCoversByAlbumRef.current !== coverMap || syncedCoverUriCacheRef.current !== coverUriMap) return;
      if (cover.available === false) {
        await syncedCatalogStoreRef.current.markCoverState(
          activeIdentity.libraryId,
          activeIdentity.revision,
          cover.albumKey,
          SyncedCatalogStore.COVER_MISSING
        );
        done++;
        continue;
      }

      const progressTime = Date.now();
      if (progressTime - lastCatalogCoverProgressAtRef.current >= 2000) {
        lastCatalogCoverProgressAtRef.current = progressTime;
        setState((prev) => ({
          ...prev,
          catalogSyncMessage: `Downloading covers ${Math.min(done, downloadableTotal)}/${downloadableTotal}`,
        }));
      }

      // Only a cover on disk counts as stored; the memory fallback is just for display.
      const existing = (await syncedCoverStoreRef.current.contains(activeIdentity.libraryId, cover.coverKey))
        ? await syncedCoverStoreRef.current.getUri(activeIdentity.libraryId, cover.coverKey)
        : null;
      if (existing) {
        if (!ownsCatalogSync() || syncedCoverUriCacheRef.current !== coverUriMap) return;
        await syncedCatalogStoreRef.current.markCoverState(
          activeIdentity.libraryId,
          activeIdentity.revision,
          cover.albumKey,
          SyncedCatalogStore.COVER_STORED
        );
        if (!ownsCatalogSync() || syncedCoverUriCacheRef.current !== coverUriMap) return;
        coverUriMap.set(cover.albumKey, existing);
        done++;
        continue;
      }

      try {
        const art = await catalogNetwork(api, attempt, generation, true, () =>
          api.catalogArt(activeIdentity.revision, cover.representativeId, cover.coverKey)
        );
        if (!ownsCatalogSync() || syncedCoverUriCacheRef.current !== coverUriMap) return;
        if (art && art.base64) {
          const stored = await syncedCoverStoreRef.current.put(activeIdentity.libraryId, cover.coverKey, art.base64);
          const uri = await syncedCoverStoreRef.current.getUri(activeIdentity.libraryId, cover.coverKey, art.contentType || 'image/jpeg');
          if (!ownsCatalogSync() || syncedCoverUriCacheRef.current !== coverUriMap) return;
          if (!stored) {
            // Disk write failed: show it from memory, but leave it pending for the next sync.
            if (uri) coverUriMap.set(cover.albumKey, uri);
            done++;
            continue;
          }
          await syncedCatalogStoreRef.current.markCoverState(
            activeIdentity.libraryId,
            activeIdentity.revision,
            cover.albumKey,
            uri ? SyncedCatalogStore.COVER_STORED : SyncedCatalogStore.COVER_MISSING
          );
          if (uri) coverUriMap.set(cover.albumKey, uri);
        } else {
          await syncedCatalogStoreRef.current.markCoverState(
            activeIdentity.libraryId,
            activeIdentity.revision,
            cover.albumKey,
            SyncedCatalogStore.COVER_MISSING
          );
        }
      } catch (err: any) {
        if (err?.statusCode === 404) {
          await syncedCatalogStoreRef.current.markCoverState(
            activeIdentity.libraryId,
            activeIdentity.revision,
            cover.albumKey,
            SyncedCatalogStore.COVER_MISSING
          );
        } else if (err?.statusCode === 413) {
          await syncedCatalogStoreRef.current.markCoverState(
            activeIdentity.libraryId,
            activeIdentity.revision,
            cover.albumKey,
            SyncedCatalogStore.COVER_PERMANENT_FAILURE
          );
        } else if (!requeued.has(cover.albumKey) && ownsCatalogSync()) {
          requeued.add(cover.albumKey);
          pending.push(cover);
          continue;
        }
      }
      done++;
    }

    if (ownsCatalogSync()) setState((prev) => ({ ...prev, catalogSyncMessage: null }));
  };

  // Background Bluetooth audio suspends polling; a lock-screen action gets one status read
  // shortly after, so the notification shows the new track and play/pause follows the player.
  const reconcileAfterMediaAction = () => {
    if (!BluetoothRequestPolicy.allowsActionReconciliation(
      stateRef.current.connectionTransport,
      appForegroundRef.current,
      bluetoothAudioOutputRef.current
    )) return;
    if (reconcileTimerRef.current) clearTimeout(reconcileTimerRef.current);
    reconcileTimerRef.current = setTimeout(() => {
      reconcileTimerRef.current = null;
      if (!apiRef.current) return;
      reconcileOnceRef.current = true;
      startPollingLoop();
    }, MEDIA_ACTION_RECONCILE_DELAY_MS);
  };

  // Status Polling Loop
  const startPollingLoop = (immediate = false) => {
    if (pollingTimerRef.current) clearTimeout(pollingTimerRef.current);
    // A poll still awaiting status() when the loop restarts must not schedule a second loop.
    const loopToken = ++pollLoopTokenRef.current;
    const schedule = (delayMs: number) => {
      if (loopToken === pollLoopTokenRef.current) pollingTimerRef.current = setTimeout(poll, delayMs);
    };

    const poll = async () => {
      const api = apiRef.current;
      if (!api || stateRef.current.connectionStatus !== ConnectionStatus.Connected) return;

      const transport = stateRef.current.connectionTransport;
      const reconcile = reconcileOnceRef.current;
      reconcileOnceRef.current = false;
      if (!reconcile && !BluetoothRequestPolicy.allowsPassiveRequests(
        transport,
        appForegroundRef.current,
        bluetoothAudioOutputRef.current
      )) {
        schedule(1000);
        return;
      }

      try {
        if (
          transport === ConnectionTransport.Bluetooth &&
          Date.now() - lastWifiProbeAtRef.current >= 30_000 &&
          await tryUpgradeToWifi(api)
        ) {
          startPollingLoop();
          return;
        }
        const snap = gateRef.current.snapshot();
        const requestStartedAtMs = Date.now();
        const commandGeneration = api.commandGeneration;
        const status = await api.status();
        if (api !== apiRef.current) return;
        const collection = collectionPendingRef.current;
        if (collection && collection.api === api && collection.attempt === connectionAttemptRef.current && collectionJobSettled(collection.id, collection.startedAt, status.collectionJob, Date.now())) {
          collectionPendingRef.current = null;
          setState((prev) => ({ ...prev, collectionBusy: false,
            connectionMessage: status.collectionJob?.id === collection.id && status.collectionJob.state === 'error' ? status.collectionJob.error || 'Could not play collection' : Date.now() - collection.startedAt > 120000 ? 'The player has not confirmed collection playback.' : prev.connectionMessage }));
          refreshQueue(api).catch(() => {});
        }
        if (featureSetRef.current.has('library_sorting') && !sortingWriteRef.current && Date.now() - sortingRefreshAtRef.current > 10000) {
          sortingRefreshAtRef.current = Date.now();
          void refreshLibrarySorting(api);
        }

        if (apiRef.current !== api) return;
        const now = Date.now();
        bluetoothAudioOutputRef.current = status.bluetoothAudioOutput ?? null;

        const playbackActive = status.playing && !status.paused;
        const confirmed = gateRef.current.confirmStatus(snap, playbackActive, now);
        const effectivePlaying = confirmed ? playbackActive : stateRef.current.isPlaying;

        const trackChanged =
          status.title !== currentTrackRef.current?.title ||
          status.artist !== currentTrackRef.current?.artist ||
          status.album !== currentTrackRef.current?.album;

        const bluetoothPriority = BluetoothRequestPolicy.requiresBluetoothAudioPriority(
          transport,
          status.bluetoothAudioOutput
        );
        const artworkDue = !bluetoothPriority || now - lastBluetoothArtworkAtRef.current >=
          BluetoothRequestPolicy.artworkMinIntervalMs(transport, status.bluetoothAudioOutput);
        const artworkRequest = {
          allowed: BluetoothRequestPolicy.allowsArtworkRequest(transport, playbackActive, status.bluetoothAudioOutput) &&
            (!bluetoothPriority || (appForegroundRef.current && gateRef.current.confirmedPaused)) &&
            artworkDue,
          commandGeneration,
        };
        const artworkUri = status.title ? nowPlayingArtwork.sync(status, artworkRequest) ?? undefined : undefined;

        const hasTrackMetadata = !!(status.title || status.artist || status.album);
        const nextTrack: RemoteTrack | null = status.title
          ? {
              id: 'now_playing',
              title: status.title,
              artist: status.artist,
              album: status.album,
              duration: formatDuration((status.durationSeconds || 0) * 1000),
              artwork: artworkUri,
              codec: status.codec,
              sourceBitDepth: status.sourceBitDepth,
              sourceSampleRateHz: status.sourceSampleRateHz,
            }
          : !hasTrackMetadata && (status.playing || status.paused)
            ? currentTrackRef.current
            : null;

        const previousTrack = currentTrackRef.current;
        const currentTrack = nextTrack && previousTrack &&
          nextTrack.id === previousTrack.id &&
          nextTrack.title === previousTrack.title &&
          nextTrack.artist === previousTrack.artist &&
          nextTrack.album === previousTrack.album &&
          nextTrack.duration === previousTrack.duration &&
          nextTrack.artwork === previousTrack.artwork &&
          nextTrack.codec === previousTrack.codec &&
          nextTrack.sourceBitDepth === previousTrack.sourceBitDepth &&
          nextTrack.sourceSampleRateHz === previousTrack.sourceSampleRateHz
          ? previousTrack : nextTrack;

        currentTrackRef.current = currentTrack;

        const mode =
          fromNumeric(status.playMode, featureSetRef.current.has('shuffle_modes'));

        const serverPositionMs = (status.positionSeconds || 0) * 1000;
        let displayedPositionMs = serverPositionMs;
        const pendingSeek = pendingSeekRef.current;
        if (pendingSeek) {
          const elapsedMs = Math.max(0, now - pendingSeek.startedAtMs);
          const optimisticPositionMs = pendingSeek.positionMs + (playbackActive ? elapsedMs : 0);
          const seekConfirmedByPoll = pendingSeek.commandCompletedAtMs != null &&
            requestStartedAtMs >= pendingSeek.commandCompletedAtMs &&
            Math.abs(serverPositionMs - optimisticPositionMs) <= 2500;
          const seekExpired = pendingSeek.commandCompletedAtMs != null &&
            now - pendingSeek.commandCompletedAtMs > 8000;
          if (seekConfirmedByPoll || seekExpired) {
            pendingSeekRef.current = null;
          } else {
            displayedPositionMs = optimisticPositionMs;
          }
        }

        let displayedVolume = normalizedVolume(status.volume);
        const pendingVolume = pendingVolumeRef.current;
        if (pendingVolume) {
          const volumeConfirmedByPoll = pendingVolume.commandCompletedAtMs != null &&
            requestStartedAtMs >= pendingVolume.commandCompletedAtMs &&
            Math.abs(displayedVolume - pendingVolume.volume) <= 0.02;
          if (volumeConfirmedByPoll || now > pendingVolume.expiresAtMs) {
            pendingVolumeRef.current = null;
          } else {
            displayedVolume = pendingVolume.volume;
          }
        }

        positionStoreRef.current.set(displayedPositionMs, (status.durationSeconds || 0) * 1000);
        setState((prev) => withPolledPlayback(prev, {
          isPlaying: effectivePlaying,
          volume: displayedVolume,
          currentTrack,
          playbackMode: mode,
          currentFavorite: !!status.favorite,
        }));
        setState((prev) => {
          const playerAccentColor = featureSetRef.current.has('player_accent') ? status.accentColor ?? null : null;
          const deviceModel = featureSetRef.current.has('device_info') ? status.deviceModel ?? null : null;
          const playerVersion = featureSetRef.current.has('device_info') ? status.playerVersion ?? null : null;
          if (prev.playerAccentColor === playerAccentColor && prev.deviceModel === deviceModel && prev.playerVersion === playerVersion) return prev;
          return { ...prev, playerAccentColor, deviceModel, playerVersion };
        });

        const foreground = appForegroundRef.current;
        const nextInterval = Math.max(
          BluetoothRequestPolicy.statusPollInterval(transport, 1500, status.bluetoothAudioOutput),
          foreground ? 0 : BACKGROUND_STATUS_POLL_MS
        );
        const queueInterval = foreground ? BluetoothRequestPolicy.queuePollInterval(
          transport,
          stateRef.current.screen,
          5000,
          status.bluetoothAudioOutput
        ) : null;
        if (queueInterval != null && now - lastQueueRefreshAtRef.current >= queueInterval) {
          lastQueueRefreshAtRef.current = now;
          refreshQueueIfChanged(api).catch(() => {});
        }
        if (trackChanged && transport === ConnectionTransport.Bluetooth && !queueInterval) {
          refreshQueueIfChanged(api).catch(() => {});
          lastQueueRefreshAtRef.current = now;
        }
        const bluetoothArtCanResume = BluetoothRequestPolicy.allowsArtworkRequest(
          transport,
          playbackActive,
          status.bluetoothAudioOutput
        ) && (!BluetoothRequestPolicy.requiresBluetoothAudioPriority(transport, status.bluetoothAudioOutput) ||
          (confirmed && !playbackActive && appForegroundRef.current));
        if (bluetoothArtCanResume && deferredBluetoothArtworkEntryIdsRef.current.length > 0) {
          const entryId = deferredBluetoothArtworkEntryIdsRef.current.shift();
          if (entryId) setTimeout(() => { void loadLibraryArtwork(entryId); }, 0);
        }
        schedule(nextInterval);
      } catch (err: any) {
        if (apiRef.current !== api) return;
        const playerKey = connectedPlayerKeyRef.current;
        apiRef.current = null;
        connectedPlayerKeyRef.current = null;
        bluetoothAudioOutputRef.current = null;
        if (err?.statusCode === 429 && err?.pinRateLimited) {
          runPinCooldown(
            Math.max(1, Math.min(3600, Number(err.retryAfterSeconds) || 60)),
            stateRef.current.pinInput
          );
          return;
        }
        if (err?.statusCode === 401 && err?.pinRequired) {
          if (playerKey) await pinStoreRef.current.remove(playerKey);
          stopPlaybackService().catch(() => {});
          positionStoreRef.current.reset();
          setState((prev) => ({
            ...prev,
            connectionStatus: ConnectionStatus.Error,
            connectionMessage: 'Remote Control requires the PIN configured on the player.',
            pinDialogVisible: true,
            pinInput: '',
            pinError: 'The saved PIN was rejected. Enter the current PIN.',
            currentTrack: null,
            isPlaying: false,
          }));
          return;
        }
        // Unexpected connection loss during poll
        if (autoReconnectEnabledRef.current) {
          setState((prev) => ({
            ...prev,
            connectionStatus: ConnectionStatus.Connecting,
            connectionMessage: 'Reconnecting to player…',
          }));
          scheduleAutoReconnect(2000);
        } else {
          setState((prev) => ({
            ...prev,
            connectionStatus: ConnectionStatus.Error,
            connectionMessage: err?.message || 'Connection to Compás player was lost.',
          }));
          schedule(3000);
        }
      }
    };

    if (immediate) void poll();
    else schedule(300);
  };

  // Queue Operations
  const queueTrackFrom = (song: Song, fallbackOffset: number, revision: number): RemoteTrack => {
    const id = nextEntryId('queue');
    const offset = song.offset != null ? song.offset : fallbackOffset;
    queueTargetsRef.current.set(id, { offset, revision, songIndex: song.index });
    return {
      id,
      title: song.title,
      artist: song.artist,
      album: song.album,
      duration: '',
      artwork: queueArtworkBySongRef.current.get(song.index) ?? null,
      queueOffset: offset,
    };
  };

  const refreshQueue = async (activeApi?: RemoteApi) => {
    const api = activeApi || apiRef.current;
    if (!api || api !== apiRef.current) return;
    const generation = ++queueRefreshGenerationRef.current;
    queuePageGenerationRef.current++;
    queueRefreshInFlightRef.current = true;

    setState((prev) => ({ ...prev, queueStatus: ContentStatus.Loading, queueLoadingMore: false }));
    try {
      const qPage = await api.queue(0, 25);
      if (api !== apiRef.current || generation !== queueRefreshGenerationRef.current) return;
      queueRevisionRef.current = qPage.revision;
      queueTargetsRef.current.clear();

      const tracks = qPage.songs.map((song, idx) => queueTrackFrom(song, idx, qPage.revision));

      setState((prev) => ({
        ...prev,
        queue: tracks,
        queueTotal: qPage.total,
        queueHasMore: tracks.length < qPage.total,
        queueStatus: tracks.length > 0 ? ContentStatus.Ready : ContentStatus.Empty,
        // The refresh this message announced is done.
        connectionMessage: prev.connectionMessage === QUEUE_REFRESHING_MESSAGE ? null : prev.connectionMessage,
      }));
      void loadQueueArtwork(qPage.songs.map((song) => song.index), api);
    } catch {
      if (api !== apiRef.current || generation !== queueRefreshGenerationRef.current) return;
      setState((prev) => ({ ...prev, queueStatus: ContentStatus.Error }));
    } finally {
      if (api === apiRef.current && generation === queueRefreshGenerationRef.current) {
        queueRefreshInFlightRef.current = false;
      }
    }
  };

  const refreshQueueIfChanged = async (api: RemoteApi) => {
    const page = await api.queue(0, 25);
    if (api !== apiRef.current) return;
    lastQueueRefreshAtRef.current = Date.now();
    if (page.revision !== queueRevisionRef.current || page.total !== stateRef.current.queueTotal) {
      await refreshQueue(api);
    }
  };

  const tryUpgradeToWifi = async (
    currentApi: RemoteApi,
    candidateAddress?: string,
    explicit: boolean = false,
    isStillRequested: () => boolean = () => true,
    expectedPublicLibraryId?: string,
  ): Promise<boolean> => {
    lastWifiProbeAtRef.current = Date.now();
    const attempt = connectionAttemptRef.current;
    const currentPlayerKey = connectedPlayerKeyRef.current;
    const ownsSession = () => isStillRequested() && apiRef.current === currentApi &&
      connectionAttemptRef.current === attempt && connectedPlayerKeyRef.current === currentPlayerKey &&
      stateRef.current.connectionStatus === ConnectionStatus.Connected &&
      stateRef.current.connectionTransport === ConnectionTransport.Bluetooth;
    if (!ownsSession() || !featureSetRef.current.has(RemoteApi.CATALOG_SYNC_FEATURE)) return false;
    if (collectionStartingRef.current || collectionPendingRef.current || sortingWriteRef.current || bulkActionBusyRef.current) return false;
    if (!explicit && !BluetoothRequestPolicy.allowsPassiveRequests(
      ConnectionTransport.Bluetooth,
      appForegroundRef.current,
      bluetoothAudioOutputRef.current
    )) return false;
    const savedAddress = candidateAddress ?? await AsyncStorage.getItem(PREF_WIFI_ADDRESS);
    if (!ownsSession() || !savedAddress?.trim()) return false;
    const wifiPerms = getRequiredPermissionsForWifi();
    if (wifiPerms.length > 0 && !(await checkPermissions(wifiPerms))) return false;
    if (!ownsSession()) return false;

    // Passive probes need the same credential-safe prefilter as the explicit
    // import upgrade. Read the connected player's public ID without a PIN and
    // fail closed when either firmware omits it.
    let expectedLibraryId = expectedPublicLibraryId;
    if (!expectedLibraryId) {
      try {
        const sourceCapabilities = await currentApi.capabilities({ omitPin: true });
        if (!ownsSession() || !sourceCapabilities.libraryId?.trim()) return false;
        expectedLibraryId = sourceCapabilities.libraryId;
      } catch {
        return false;
      }
    }

    let endpoint: string;
    try {
      endpoint = RemoteEndpoint.normalizeWifiAddress(savedAddress);
    } catch {
      return false;
    }
    const playerKey = endpoint;
    const candidate = new RemoteApi(createWifiTransport(endpoint, 5000));
    let savedPin = await pinStoreRef.current.get(playerKey);
    if (!ownsSession()) return false;

    try {
      const caps = await candidate.capabilities({ omitPin: true });
      if (caps.version !== 1 || !ownsSession() || !caps.features.includes(RemoteApi.CATALOG_SYNC_FEATURE) ||
          (explicit && (!caps.features.includes('wifi_import') || !caps.features.includes('wifi_import_files')))) return false;
      if (!publicLibraryIdentityMatches(expectedLibraryId, caps.libraryId)) return false;
      if (savedPin) candidate.setPin(savedPin);
      let identityMatches = await verifyWifiUpgradeIdentity(currentApi, candidate, ownsSession);
      let sourcePin: string | null = null;
      if (!identityMatches && explicit) {
        sourcePin = currentPlayerKey ? await pinStoreRef.current.get(currentPlayerKey) : null;
        if (!ownsSession()) return false;
        if (sourcePin && sourcePin !== savedPin) {
          candidate.setPin(sourcePin);
          identityMatches = await verifyWifiUpgradeIdentity(currentApi, candidate, ownsSession);
        }
      }
      if (!identityMatches) return false;
      const status = await candidate.status();
      if (!ownsSession()) return false;
      if (collectionStartingRef.current || collectionPendingRef.current || sortingWriteRef.current || bulkActionBusyRef.current) return false;
      if (sourcePin && sourcePin !== savedPin) await pinStoreRef.current.put(playerKey, sourcePin);
      if (!ownsSession()) return false;

      currentApi.preemptArtworkRequest();
      if (connectedPlayerKeyRef.current !== playerKey) {
        activeCatalogRef.current = null;
        clearArtworkState();
        libraryEntriesRef.current.clear();
        libraryListCacheRef.current.clear();
        libraryBackStackRef.current = [];
        libraryContextRef.current = null;
        shownLibraryListRef.current = null;
        setState((prev) => ({ ...prev, libraryEntries: [], queue: [], libraryIsNested: false }));
      }
      apiRef.current = candidate;
      pendingSeekRef.current = null;
      pendingVolumeRef.current = null;
      connectedPlayerKeyRef.current = playerKey;
      lastPlayerKeyRef.current = playerKey;
      activeWifiEndpointRef.current = endpoint;
      wifiImportOperationRef.current++;
      setWifiImportStatus({ state: 'stopped', error: null });
      featureSetRef.current = new Set(caps.features);
      bluetoothAudioOutputRef.current = null;
      lastQueueRefreshAtRef.current = Date.now();
      gateRef.current.reset();
      AsyncStorage.setItem(PREF_LAST_TRANSPORT, 'wifi').catch(() => {});
      AsyncStorage.setItem(PREF_WIFI_ADDRESS, endpoint).catch(() => {});
      positionStoreRef.current.set(status.positionSeconds * 1000, status.durationSeconds * 1000);
      setState((prev) => ({
        ...prev,
        connectionStatus: ConnectionStatus.Connected,
        connectionTransport: ConnectionTransport.Wifi,
        connectionMessage: null,
        isPlaying: status.playing && !status.paused,
        volume: normalizedVolume(status.volume),
        currentTrack: status.title ? {
          id: 'now_playing',
          title: status.title,
          artist: status.artist,
          album: status.album,
          duration: formatDuration(status.durationSeconds * 1000),
          codec: status.codec,
          sourceBitDepth: status.sourceBitDepth,
          sourceSampleRateHz: status.sourceSampleRateHz,
        } : null,
        playbackMode: fromNumeric(status.playMode, featureSetRef.current.has('shuffle_modes')),
        supportedFeatures: caps.features,
        playerAccentColor: caps.features.includes('player_accent') ? status.accentColor ?? null : null,
        deviceModel: caps.features.includes('device_info') ? status.deviceModel ?? null : null,
        playerVersion: caps.features.includes('device_info') ? status.playerVersion ?? null : null,
      }));
      currentTrackRef.current = status.title ? {
        id: 'now_playing',
        title: status.title,
        artist: status.artist,
        album: status.album,
        duration: formatDuration(status.durationSeconds * 1000),
        codec: status.codec,
        sourceBitDepth: status.sourceBitDepth,
        sourceSampleRateHz: status.sourceSampleRateHz,
      } : null;
      refreshQueue(candidate);
      loadLibraryCategory(currentLibraryCategoryRef.current, candidate);
      startCatalogSync(candidate, connectionAttemptRef.current, caps.features);
      // A Bluetooth poll in flight during the swap returns without rescheduling.
      startPollingLoop();
      return true;
    } catch {
      return false;
    }
  };

  const loadMoreQueue = async () => {
    const api = apiRef.current;
    if (!api || queueRefreshInFlightRef.current || stateRef.current.queueLoadingMore || !stateRef.current.queueHasMore) return;
    const refreshGeneration = queueRefreshGenerationRef.current;
    const pageGeneration = ++queuePageGenerationRef.current;

    setState((prev) => ({ ...prev, queueLoadingMore: true }));
    try {
      const currentLen = stateRef.current.queue.length;
      const qPage = await api.queue(currentLen, 25);
      if (api !== apiRef.current
        || refreshGeneration !== queueRefreshGenerationRef.current
        || pageGeneration !== queuePageGenerationRef.current) return;

      if (qPage.revision !== queueRevisionRef.current) {
        setState((prev) => ({
          ...prev,
          queueLoadingMore: false,
          connectionMessage: QUEUE_REFRESHING_MESSAGE,
        }));
        refreshQueue(api);
        return;
      }

      const newTracks = qPage.songs.map((song, idx) => queueTrackFrom(song, currentLen + idx, qPage.revision));

      setState((prev) => ({
        ...prev,
        queue: [...prev.queue, ...newTracks],
        queueHasMore: prev.queue.length + newTracks.length < qPage.total,
        queueLoadingMore: false,
      }));
      void loadQueueArtwork(qPage.songs.map((song) => song.index), api);
    } catch {
      if (api !== apiRef.current
        || refreshGeneration !== queueRefreshGenerationRef.current
        || pageGeneration !== queuePageGenerationRef.current) return;
      setState((prev) => ({ ...prev, queueLoadingMore: false }));
    }
  };

  const removeQueueTrack = async (id: string) => {
    if (bulkActionBusyRef.current) return;
    const target = queueTargetsRef.current.get(id);
    const api = apiRef.current;
    if (!target || !api) return;

    setState((prev) => ({
      ...prev,
      queue: prev.queue.filter((t) => t.id !== id),
    }));

    try {
      await api.removeFromQueue(target.offset, target.revision);
      if (api === apiRef.current) {
        refreshQueue(api);
      }
    } catch (failure: any) {
      if (api !== apiRef.current) return;
      if (failure?.statusCode === 409) {
        setState((prev) => ({
          ...prev,
          connectionMessage: 'The queue changed. It has been refreshed; try again.',
        }));
        refreshQueue(api);
      } else {
        setState((prev) => ({
          ...prev,
          connectionMessage: failure?.message || 'Could not remove track from queue',
        }));
        await refreshQueue(api);
      }
    }
  };

  const removeQueueTracks = async (ids: string[]) => {
    const api = apiRef.current;
    if (!api || bulkActionBusyRef.current || !featureSetRef.current.has('queue_edit')) return;
    const playerKey = connectedPlayerKeyRef.current;
    const selected = ids.map((id) => queueTargetsRef.current.get(id)).filter((item): item is QueueTarget => Boolean(item));
    if (!selected.length || selected.length !== ids.length) {
      if (api) {
        setState((prev) => ({ ...prev, bulkActionProgress: { action: 'queueRemove', completed: 0, total: ids.length, succeeded: 0, failed: 0, processed: 0, phase: 'error', message: 'Queue changed. Select tracks again before removing them.' } }));
        await refreshQueue(api);
      }
      return;
    }
    bulkActionBusyRef.current = true;
    bulkActionCancelledRef.current = false;
    const run = ++bulkActionRunRef.current;
    const attempt = connectionAttemptRef.current;
    const isCancelled = () => bulkActionCancelledRef.current || run !== bulkActionRunRef.current || api !== apiRef.current || playerKey !== connectedPlayerKeyRef.current || attempt !== connectionAttemptRef.current;
    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    const total = new Set(selected.map((target) => target.offset)).size;
    let removalInFlight = false;
    let writeAttempted = false;
    const publish = (phase: 'writing' | 'cancelled' | 'error' | 'done', message?: string, messageValues?: Record<string, string | number>) => {
      if (api !== apiRef.current || playerKey !== connectedPlayerKeyRef.current) {
        if (phase !== 'writing') abandonBulkProgress('queueRemove');
        return;
      }
      setState((prev) => ({ ...prev, bulkActionProgress: { action: 'queueRemove', completed: processed, total, succeeded, failed, processed, phase, message: message ?? null, messageValues } }));
    };
    const countValues = () => ({ succeeded, failed, processed, total });
    try {
      publish('writing');
      let snapshot = await readQueueSnapshot((offset, limit) => api.queue(offset, limit), isCancelled);
      if (isCancelled()) { publish('cancelled', 'Stopped. {succeeded} succeeded, {failed} failed, {processed} processed of {total}. Confirmed removals remain applied.', countValues()); return; }
      if (selected.some((target) => target.revision !== snapshot.revision || snapshot.songs[target.offset]?.index !== target.songIndex)) {
        throw new Error('Queue changed. Select tracks again before removing them.');
      }
      const offsets = [...new Set(selected.map((target) => target.offset))].sort((a, b) => b - a);
      for (const offset of offsets) {
        if (isCancelled()) break;
        const before = snapshot;
        if (queueRemovalAmbiguousAt(before.songs, offset)) throw new Error('The same song appears more than once beside this selection. Select a different occurrence or remove one at a time.');
        removalInFlight = true;
        writeAttempted = true;
        await api.removeFromQueue(offset, before.revision);
        // The command ACK may precede the GUI mutation. Poll without adopting an unverified revision.
        let confirmed: Awaited<ReturnType<typeof readQueueSnapshot>> | null;
        try {
          confirmed = await waitForQueueTransition(before, before.revision + 1,
            (observed) => queueRemovalMatches(before.songs, observed.songs, offset),
            () => readQueueSnapshot((pageOffset, limit) => api.queue(pageOffset, limit), isCancelled), isCancelled);
        } catch {
          if (isCancelled()) { confirmed = null; }
          else throw new Error('Queue changed during removal. Remaining selections were stopped.');
        }
        if (isCancelled()) break;
        if (!confirmed) throw new Error('Removal was accepted but could not be confirmed. Remaining selections were stopped.');
        snapshot = confirmed;
        removalInFlight = false;
        succeeded++;
        processed++;
        writeAttempted = false;
        publish('writing');
      }
      if (isCancelled()) publish('cancelled', removalInFlight
        ? 'Stopped. {succeeded} succeeded, {failed} failed, {processed} processed of {total}. One removal may still be completing; the queue is being refreshed.'
        : 'Stopped. {succeeded} succeeded, {failed} failed, {processed} processed of {total}. Confirmed removals remain applied.', countValues());
      else publish('done', '{succeeded} succeeded, {failed} failed, {processed} processed of {total}.', countValues());
    } catch (err: any) {
      if (isCancelled()) {
        publish('cancelled', writeAttempted
          ? 'Stopped. {succeeded} succeeded, {failed} failed, {processed} processed of {total}. One removal may still be completing; the queue is being refreshed.'
          : 'Stopped. {succeeded} succeeded, {failed} failed, {processed} processed of {total}. Confirmed removals remain applied.', countValues());
      } else {
        if (writeAttempted) { failed++; processed++; }
        const message = removalInFlight
          ? '{succeeded} succeeded, {failed} failed, {processed} processed of {total}. {error} One removal may still finish; refresh the queue before retrying.'
          : '{succeeded} succeeded, {failed} failed, {processed} processed of {total}. {error} Confirmed removals remain applied.';
        publish('error', message, { ...countValues(), error: err?.message || 'Queue removal stopped.' });
      }
    } finally {
      if (api === apiRef.current && playerKey === connectedPlayerKeyRef.current) await refreshQueue(api);
      if (run === bulkActionRunRef.current) { bulkActionBusyRef.current = false; bulkActionCancelledRef.current = false; }
    }
  };

  const refreshSortedView = (api: RemoteApi, context = libraryContextRef.current, nested = stateRef.current.libraryIsNested, nestedTitle = stateRef.current.libraryNestedTitle) => {
    libraryListCacheRef.current.clear();
    if (api !== apiRef.current || stateRef.current.screen.type !== 'Library') return;
    if (nested && nestedTitle === 'Albums' && context) {
      const count = stateRef.current.libraryEntries.reduce((total, entry) => {
        const target = libraryEntriesRef.current.target(entry.id);
        return total + (target?.type === 'Album' ? target.group.count : 0);
      }, 0);
      void loadGroupAlbums({ name: context.name, count, index: 0, albumArtist: '' }, context.kind);
    } else if (!nested && currentLibraryCategoryRef.current === LibraryCategory.Albums) {
      void loadLibraryCategory(LibraryCategory.Albums, api, null, true);
    }
  };

  const publishLibrarySorting = (api: RemoteApi, sorting: LibrarySortingSnapshot) => {
    if (api !== apiRef.current) return;
    if (JSON.stringify(librarySortingRef.current) === JSON.stringify(sorting)) return;
    librarySortingRef.current = sorting;
    sortingEpochRef.current++;
    setState((prev) => ({ ...prev, librarySorting: sorting }));
    refreshSortedView(api);
  };

  const refreshLibrarySorting = async (api: RemoteApi) => {
    const attempt = connectionAttemptRef.current;
    try {
      const sorting = await api.librarySorting();
      if (api === apiRef.current && attempt === connectionAttemptRef.current && !sortingWriteRef.current) publishLibrarySorting(api, sorting);
    } catch { /* An optional ordering refresh must not disconnect playback. */ }
  };

  const setLibrarySorting = async (scope: LibrarySortScope, mode: LibrarySortMode) => {
    const api = apiRef.current;
    if (!api || sortingWriteRef.current || !featureSetRef.current.has('library_sorting')) return;
    const attempt = connectionAttemptRef.current;
    sortingWriteRef.current = true;
    try {
      await api.setLibrarySorting(scope, mode);
      for (let i = 0; i < 15; i++) {
        if (api !== apiRef.current || attempt !== connectionAttemptRef.current) return;
        await new Promise((resolve) => setTimeout(resolve, 150));
        if (api !== apiRef.current || attempt !== connectionAttemptRef.current) return;
        const sorting = await api.librarySorting();
        if (api !== apiRef.current || attempt !== connectionAttemptRef.current) return;
        const selected = scope === 'album_artists' ? sorting.albumArtists : sorting[scope];
        if (selected.configured === mode) { publishLibrarySorting(api, sorting); return; }
      }
      throw new Error('The player has not confirmed the sorting change.');
    } catch (error: any) {
      if (api === apiRef.current && attempt === connectionAttemptRef.current) setState((prev) => ({ ...prev, connectionMessage: error.message || 'Could not change sorting' }));
    } finally { sortingWriteRef.current = false; }
  };

  const playNativeCollection = async (shuffle: boolean) => {
    const api = apiRef.current;
    if (!api || collectionStartingRef.current || collectionPendingRef.current || bulkActionBusyRef.current || !featureSetRef.current.has('collection_playback')) return;
    const view = stateRef.current;
    const page = libraryPageRef.current;
    const request = buildCollectionPlaybackRequest({ category: currentLibraryCategoryRef.current,
      nestedTitle: view.libraryNestedTitle, isNested: view.libraryIsNested, query: view.libraryQuery,
      playlist: activePlaylistRef.current, libraryContext: libraryContextRef.current,
      pageFilter: page?.filter, albumIdentity: page?.albumIdentity, playbackMode: view.playbackMode,
      catalogRevision: activeCatalogRef.current?.revision ?? null,
      supportsShuffleModes: featureSetRef.current.has('shuffle_modes'), shuffle });
    if (!request) return;
    const attempt = connectionAttemptRef.current;
    const startToken = ++collectionStartTokenRef.current;
    collectionStartingRef.current = true;
    setState((prev) => ({ ...prev, collectionBusy: true, connectionMessage: null }));
    try {
      if (!request.catalogRevision) {
        const catalog = await api.catalog(0, 1);
        if (api !== apiRef.current || attempt !== connectionAttemptRef.current) return;
        request.catalogRevision = catalog.revision;
      }
      const id = await api.playCollection(request);
      if (api !== apiRef.current || attempt !== connectionAttemptRef.current) return;
      collectionPendingRef.current = { id, api, attempt, startedAt: Date.now() };
    } catch (error: any) {
      if (api === apiRef.current && attempt === connectionAttemptRef.current) setState((prev) => ({ ...prev, collectionBusy: false, connectionMessage: error.message || 'Could not play collection' }));
    } finally { if (startToken === collectionStartTokenRef.current) collectionStartingRef.current = false; }
  };

  const librarySource = (): string => {
    const catalog = activeCatalogRef.current;
    return catalog ? `catalog:${catalog.libraryId}:${catalog.revision}` : `player:${connectionAttemptRef.current}`;
  };

  const libraryLoadContext = (api: RemoteApi): CategoryLoadContext => ({
    api,
    catalog: activeCatalogRef.current,
    store: syncedCatalogStoreRef.current,
    entries: libraryEntriesRef.current,
    features: featureSetRef.current,
    librarySorting: librarySortingRef.current,
  });

  const showLibraryList = (key: string, list: LibraryList) => {
    extensionPageRef.current = list.extensionPage;
    shownLibraryListRef.current = key;
    setState((prev) => ({
      ...prev,
      libraryEntries: list.entries,
      libraryCountLabel: list.label,
      libraryHasMore: list.hasMore,
      libraryStatus: list.entries.length > 0 ? ContentStatus.Ready : ContentStatus.Empty,
    }));
  };

  const loadLibraryCategory = async (
    cat: LibraryCategory,
    activeApi?: RemoteApi,
    query?: string | null,
    refresh: boolean = false
  ): Promise<void> => {
    const loadGeneration = ++libraryLoadGenerationRef.current;
    const api = activeApi || apiRef.current;
    currentLibraryCategoryRef.current = cat;
    libraryContextRef.current = null;
    libraryPageRef.current = null;
    extensionPageRef.current = null;
    activePlaylistRef.current = null;

    const source = librarySource();
    const key = libraryListKey(source, cat);
    const cached = refresh ? undefined : libraryListCacheRef.current.get(source, cat);
    const keepShown = shownLibraryListRef.current === key;
    const shown = cached?.entries ?? (keepShown ? stateRef.current.libraryEntries : []);
    if (!cached && !keepShown) shownLibraryListRef.current = null;

    setState((prev) => ({
      ...prev,
      ...(cached
        ? {
            libraryEntries: cached.entries,
            libraryCountLabel: cached.label,
            libraryHasMore: cached.hasMore,
            libraryStatus: cached.entries.length > 0 ? ContentStatus.Ready : ContentStatus.Empty,
          }
        : {
            libraryEntries: keepShown ? prev.libraryEntries : [],
            libraryCountLabel: keepShown ? prev.libraryCountLabel : null,
            libraryHasMore: false,
            libraryStatus: ContentStatus.Loading,
          }),
      libraryIsNested: false,
      libraryNestedTitle: null,
      libraryQuery: query ?? '',
      connectionMessage: null,
      activePlaylist: null,
      playlistRevision: null,
      folderPath: '',
    }));
    if (cached) {
      extensionPageRef.current = cached.extensionPage;
      shownLibraryListRef.current = key;
      if (!needsRevalidation(cat)) return;
    }

    if (!api) return;

    try {
      const loaded = await loadCategoryList(cat, query ?? null, libraryLoadContext(api));
      if (loadGeneration !== libraryLoadGenerationRef.current) return;
      if (librarySource() !== source) {
        await loadLibraryCategory(cat, activeApi, query, refresh);
        return;
      }
      const entries = reconcileEntries(shown, loaded.entries);
      const list = entries === loaded.entries ? loaded : { ...loaded, entries };
      libraryListCacheRef.current.set(source, cat, list);
      const unchanged = cached && entries === cached.entries && list.label === cached.label && list.hasMore === cached.hasMore;
      if (!unchanged) showLibraryList(key, list);
    } catch (err: any) {
      if (loadGeneration !== libraryLoadGenerationRef.current) return;
      setState((prev) => ({ ...prev, libraryStatus: ContentStatus.Error, connectionMessage: err?.message || 'Could not load library' }));
    }
  };

  const pushLibraryState = () => {
    libraryBackStackRef.current.push({
      sortEpoch: sortingEpochRef.current,
      category: currentLibraryCategoryRef.current,
      entries: stateRef.current.libraryEntries,
      query: stateRef.current.libraryQuery,
      status: stateRef.current.libraryStatus,
      countLabel: stateRef.current.libraryCountLabel,
      hasMore: stateRef.current.libraryHasMore,
      isNested: stateRef.current.libraryIsNested,
      nestedTitle: stateRef.current.libraryNestedTitle,
      context: libraryContextRef.current,
      total: stateRef.current.queueTotal,
      page: libraryPageRef.current,
      extensionPage: extensionPageRef.current,
      listKey: shownLibraryListRef.current,
      activePlaylist: activePlaylistRef.current,
      playlistRevision: stateRef.current.playlistRevision ?? null,
      folderPath: stateRef.current.folderPath,
      folderRoot: stateRef.current.folderRoot,
    });
    libraryLoadGenerationRef.current++;
    shownLibraryListRef.current = null;
    setState((prev) => ({ ...prev, libraryIsNested: true }));
  };

  const openGroup = async (group: LibraryGroup, kind: 'artist' | 'albumArtist' | 'genre') => {
    if (kind === 'genre') {
      libraryContextRef.current = null;
      setState((prev) => ({ ...prev, libraryNestedTitle: 'Tracks' }));
      await startSongPage({ genre: group.name }, {}, null, false);
      return;
    }
    await loadGroupAlbums(group, kind);
  };

  const loadGroupAlbums = async (group: LibraryGroup, kind: 'artist' | 'albumArtist') => {
    setState((prev) => ({
      ...prev,
      libraryNestedTitle: 'Albums',
      libraryStatus: ContentStatus.Loading,
      libraryEntries: [],
      libraryCountLabel: null,
      libraryHasMore: false,
    }));

    const api = apiRef.current;
    const catalog = activeCatalogRef.current;
    const generation = ++libraryLoadGenerationRef.current;
    const context: LibraryContext = { kind, name: group.name };
    libraryContextRef.current = context;

    try {
      let albums: LibraryGroup[] = [];
      const sort = kind === 'artist' ? librarySortingRef.current?.artists : librarySortingRef.current?.albumArtists;
      if (api && featureSetRef.current.has('library_sorting') && sort && sort.effective !== 0) {
        albums = await loadServerOrderedAlbumGroups(api, kind === 'artist' ? 'artists' : 'album_artists', kind === 'artist' ? { artist: group.name } : { albumArtist: group.name });
      } else if (catalog) {
        const stored = await syncedCatalogStoreRef.current.groups(
          catalog.libraryId,
          catalog.revision,
          CatalogGroupKind.Album,
          null,
          kind === 'artist' ? group.name : null,
          kind === 'albumArtist' ? group.name : null
        );
        albums = stored.map(libraryGroupFromCatalog);
      } else if (api) {
        albums = await api.albums(
          kind === 'artist' ? { artist: group.name } : { albumArtist: group.name }
        );
      }

      if (generation !== libraryLoadGenerationRef.current || api !== apiRef.current) return;
      const entries = libraryEntriesRef.current.albums(albums, context);
      setState((prev) => ({
        ...prev,
        libraryEntries: entries,
        libraryCountLabel: `${entries.length} albums · ${albums.reduce((count, album) => count + album.count, 0)} tracks`,
        libraryStatus: entries.length > 0 ? ContentStatus.Ready : ContentStatus.Empty,
      }));
    } catch (err: any) {
      if (generation !== libraryLoadGenerationRef.current || api !== apiRef.current) return;
      setState((prev) => ({
        ...prev,
        libraryStatus: ContentStatus.Error,
        libraryCountLabel: err?.message || 'Failed to load albums',
      }));
    }
  };

  const browseAlbum = async (album: LibraryGroup, context: LibraryContext | null) => {
    setState((prev) => ({ ...prev, libraryNestedTitle: 'Tracks' }));
    const artist = context?.kind === 'artist' ? context.name : undefined;
    const albumArtist =
      context?.kind === 'albumArtist'
        ? context.name
        : album.albumArtist && album.albumArtist.trim().length > 0
        ? album.albumArtist
        : undefined;

    const filter: LibraryFilter = artist
      ? { artist, album: album.name }
      : albumArtist
      ? { albumArtist, album: album.name }
      : { album: album.name };

    const playContext: PlayContext = artist
      ? { artist, album: album.name }
      : albumArtist
      ? { albumArtist, album: album.name }
      : { album: album.name };

    await startSongPage(filter, playContext, album.albumKey ?? null, false, { name: album.name, albumArtist: album.albumArtist ?? '', representativeId: album.index });
  };

  const browsePlaylist = async (playlist: Playlist) => {
    const generation = ++libraryLoadGenerationRef.current;
    const attempt = connectionAttemptRef.current;
    activePlaylistRef.current = playlist;
    setState((prev) => ({
      ...prev,
      libraryNestedTitle: playlist.name,
      libraryEntries: [],
      libraryStatus: ContentStatus.Loading,
      libraryCountLabel: null,
      libraryHasMore: false,
      activePlaylist: playlist,
    }));

    const api = apiRef.current;
    if (!api) return;

    try {
      const page = await api.playlistPage(playlist.key);
      if (api !== apiRef.current || attempt !== connectionAttemptRef.current || generation !== libraryLoadGenerationRef.current) return;
      const entries = libraryEntriesRef.current.songs(page.songs, { playlist: playlist.key }, null);
      extensionPageRef.current = { kind: 'playlist', key: playlist.key, nextOffset: page.nextOffset, total: page.total };
      setState((prev) => ({
        ...prev,
        libraryEntries: entries,
        libraryStatus: entries.length > 0 ? ContentStatus.Ready : ContentStatus.Empty,
        libraryCountLabel: `${page.total} tracks · ${playlist.name}`,
        libraryHasMore: page.nextOffset < page.total,
        playlistRevision: page.revision,
        playlistTrackCount: page.total,
      }));
    } catch (err: any) {
      if (api !== apiRef.current || attempt !== connectionAttemptRef.current || generation !== libraryLoadGenerationRef.current) return;
      setState((prev) => ({
        ...prev,
        libraryStatus: ContentStatus.Error,
        libraryCountLabel: err?.message || 'Failed to load playlist tracks',
      }));
    }
  };

  const browseFolder = async (root: string, path: string, name: string) => {
    const generation = ++libraryLoadGenerationRef.current;
    const attempt = connectionAttemptRef.current;
    const api = apiRef.current;
    if (!api) return;
    setState((prev) => ({
      ...prev, libraryNestedTitle: name, libraryEntries: [],
      libraryStatus: ContentStatus.Loading, libraryCountLabel: null,
      libraryHasMore: false, folderPath: path, folderRoot: root,
    }));
    try {
      const page = await api.folder(path, 0, root);
      if (generation !== libraryLoadGenerationRef.current || api !== apiRef.current || attempt !== connectionAttemptRef.current) return;
      const entries = libraryEntriesRef.current.folderItems(page.entries, root, path);
      extensionPageRef.current = { kind: 'folder', root, path, nextOffset: page.nextOffset, total: page.total };
      setState((prev) => ({
        ...prev, libraryEntries: entries,
        libraryStatus: entries.length ? ContentStatus.Ready : ContentStatus.Empty,
        libraryCountLabel: `${page.total} items`, libraryHasMore: page.nextOffset < page.total,
      }));
    } catch (err: any) {
      if (generation !== libraryLoadGenerationRef.current || api !== apiRef.current || attempt !== connectionAttemptRef.current) return;
      setState((prev) => ({ ...prev, libraryStatus: ContentStatus.Error, connectionMessage: err?.message || 'Could not open folder' }));
    }
  };

  const startSongPage = async (
    filter: LibraryFilter,
    playContext: PlayContext,
    albumKey: string | null = null,
    append: boolean = false,
    albumIdentity?: AlbumBrowseIdentity
  ) => {
    if (append && libraryPageLoadingRef.current) return;
    if (!append) libraryPageRef.current = { filter, playContext, albumKey, albumIdentity };
    if (!append) ++libraryLoadGenerationRef.current;
    const generation = libraryLoadGenerationRef.current;
    const attempt = connectionAttemptRef.current;
    const loadToken = ++libraryPageLoadTokenRef.current;
    libraryPageLoadingRef.current = true;
    const api = apiRef.current;
    const catalog = activeCatalogRef.current;
    const currentOffset = append ? stateRef.current.libraryEntries.length : 0;
    const pageSize = LIBRARY_PAGE_SIZE;

    if (append) {
      setState((prev) => ({ ...prev, libraryStatus: ContentStatus.Loading }));
    } else {
      setState((prev) => ({
        ...prev,
        libraryEntries: [],
        libraryStatus: ContentStatus.Loading,
        libraryCountLabel: null,
        libraryHasMore: false,
      }));
    }

    try {
      let songs: Song[] = [];
      let total = 0;
      let catalogRevision: string | null = null;
      const exactAlbumKey = featureSetRef.current.has('collection_playback')
        ? await exactAlbumBrowseKey(albumIdentity, filter.artist, albumKey, !!catalog,
          (id) => catalog
            ? syncedCatalogStoreRef.current.albumKeyForSong(catalog.libraryId, catalog.revision, id)
            : Promise.resolve(null), t)
        : albumKey;
      if (api !== apiRef.current || attempt !== connectionAttemptRef.current || generation !== libraryLoadGenerationRef.current) return;

      if (catalog) {
        catalogRevision = catalog.revision;
        const res = await syncedCatalogStoreRef.current.songPage(
          catalog.libraryId,
          catalog.revision,
          currentOffset,
          pageSize,
          null,
          filter.artist ?? null,
          filter.albumArtist ?? null,
          filter.album ?? null,
          filter.genre ?? null,
          exactAlbumKey
        );
        songs = res.songs.map(songFromCatalog);
        total = res.total;
      } else if (api) {
        const res = await api.library(currentOffset, pageSize, null, filter);
        songs = res.songs;
        total = res.total;
      }

      if (api !== apiRef.current || attempt !== connectionAttemptRef.current || generation !== libraryLoadGenerationRef.current) return;
      const entries = libraryEntriesRef.current.songs(
        songs,
        playContext,
        catalogRevision,
        append ? stateRef.current.libraryEntries : []
      );
      const nextEntries = append ? [...stateRef.current.libraryEntries, ...entries] : entries;

      setState((prev) => ({
        ...prev,
        libraryEntries: nextEntries,
        libraryHasMore: nextEntries.length < total,
        libraryStatus: nextEntries.length > 0 ? ContentStatus.Ready : ContentStatus.Empty,
        libraryCountLabel:
          total > nextEntries.length
            ? `Showing ${nextEntries.length} of ${total} tracks`
            : `${nextEntries.length} tracks`,
      }));
    } catch (err: any) {
      if (api !== apiRef.current || attempt !== connectionAttemptRef.current || generation !== libraryLoadGenerationRef.current) return;
      setState((prev) => ({
        ...prev,
        libraryStatus: ContentStatus.Error,
        libraryCountLabel: err?.message || 'Failed to load tracks',
      }));
    } finally {
      if (loadToken === libraryPageLoadTokenRef.current) libraryPageLoadingRef.current = false;
    }
  };

  const playLibrarySong = async (
    index: number,
    context: PlayContext = {},
    catalogRevision?: string | null
  ) => {
    const api = apiRef.current;
    if (!api) return;

    const attempt = connectionAttemptRef.current;
    const token = gateRef.current.beginExplicitAction(true);
    api.preemptArtworkRequest();

    setState((prev) => ({
      ...prev,
      isPlaying: true,
      connectionMessage: null,
    }));

    try {
      await api.play(index, context, catalogRevision);
      // Always settle the token: a reset gate ignores it, a live one would stay blocked forever.
      gateRef.current.finishAction(token, CommandOutcome.Succeeded, Date.now());
    } catch (err: any) {
      const is4xx = err?.statusCode >= 400 && err?.statusCode < 500;
      gateRef.current.finishAction(
        token,
        is4xx ? CommandOutcome.Failed : CommandOutcome.Uncertain,
        Date.now()
      );
      setState((prev) => ({
        ...prev,
        connectionMessage: err?.message || 'Playback failed',
      }));
    }
  };

  const selectLibraryEntry = async (id: string) => {
    const target = libraryEntriesRef.current.target(id);
    if (!target) return;

    switch (target.type) {
      case 'Song':
        await playLibrarySong(target.song.index, target.context, target.catalogRevision);
        break;
      case 'Playlist':
        pushLibraryState();
        await browsePlaylist(target.playlist);
        break;
      case 'Group':
        pushLibraryState();
        await openGroup(target.group, target.kind);
        break;
      case 'Album':
        pushLibraryState();
        await browseAlbum(target.group, target.context);
        break;
      case 'Folder':
        pushLibraryState();
        await browseFolder(target.root, target.path, target.name);
        break;
      case 'FolderTrack':
        if (target.item.type === 'track') {
          try {
            await apiRef.current?.playFolderTrack(target.path, target.root);
          } catch (err: any) {
            setState((prev) => ({ ...prev, connectionMessage: err?.message || 'Could not play file' }));
          }
        } else {
          setState((prev) => ({ ...prev, connectionMessage: 'Open playlist files from the Playlists section.' }));
        }
        break;
    }
  };

  const openSongActions = (id: string) => {
    const target = libraryEntriesRef.current.target(id);
    const api = apiRef.current;
    if (target?.type !== 'Song' || !api) return;
    songActionEntryIdRef.current = id;
    songActionTargetRef.current = target;
    setState((prev) => ({
      ...prev,
      songActionsVisible: true,
      songActionTitle: target.song.title,
      playlistOptions: [],
      playlistOptionsStatus: ContentStatus.Ready,
      songActionFavorite: null,
      songActionPosition: target.song.position ?? null,
      connectionMessage: null,
    }));
    if (featureSetRef.current.has('favorites_edit') && target.song.index > 0) {
      api.favoriteStates([target.song.index]).then((states) => {
        if (api === apiRef.current && songActionEntryIdRef.current === id) {
          setState((prev) => ({ ...prev, songActionFavorite: states.get(target.song.index) ?? false }));
        }
      }).catch(() => {});
    }
  };

  const loadSongPlaylists = async () => {
    const id = songActionEntryIdRef.current;
    const api = apiRef.current;
    if (!id || !api) return;
    setState((prev) => ({ ...prev, playlistOptionsStatus: ContentStatus.Loading }));
    try {
      const playlists = await api.playlists();
      if (songActionEntryIdRef.current !== id || api !== apiRef.current) return;
      setState((prev) => ({ ...prev, playlistOptions: playlists.filter((p) => p.writable), playlistOptionsStatus: ContentStatus.Ready }));
    } catch (err: any) {
      if (songActionEntryIdRef.current !== id) return;
      setState((prev) => ({ ...prev, playlistOptionsStatus: ContentStatus.Error, connectionMessage: err?.message || 'Could not load playlists' }));
    }
  };

  const closeSongActions = () => {
    songActionEntryIdRef.current = null;
    songActionTargetRef.current = null;
    setState((prev) => ({ ...prev, songActionsVisible: false }));
  };

  const runSongAction = async (kind: 'queue' | 'playlist' | 'create', value?: string) => {
    if (bulkActionBusyRef.current) return;
    const id = songActionEntryIdRef.current;
    const target = songActionTargetRef.current;
    const api = apiRef.current;
    if (target?.type !== 'Song' || !api || songActionBusyRef.current) return;
    songActionBusyRef.current = true;
    try {
      if (kind === 'queue') {
        await api.addToQueue(target.song.index, target.catalogRevision);
        setTimeout(() => { if (api === apiRef.current) refreshQueue(api); }, 350);
      } else if (kind === 'playlist' && value) {
        await api.addToPlaylist(value, target.song.index);
      } else if (kind === 'create' && value) {
        await api.createPlaylist(value.trim(), target.song.index);
      } else return;
      if (api !== apiRef.current) return;
      if (songActionEntryIdRef.current === id) closeSongActions();
      if (kind === 'create' && currentLibraryCategoryRef.current === LibraryCategory.Playlists && !stateRef.current.libraryIsNested) {
        loadLibraryCategory(LibraryCategory.Playlists, api);
      } else if (kind === 'playlist' && activePlaylistRef.current?.key === value) {
        const activePlaylist = activePlaylistRef.current;
        if (activePlaylist) browsePlaylist(activePlaylist);
      }
    } catch (err: any) {
      if (api !== apiRef.current) return;
      setState((prev) => ({ ...prev, connectionMessage: err?.message || 'Could not update the player' }));
    } finally {
      songActionBusyRef.current = false;
    }
  };

  // Swipe actions on a song row: append it, or append and then move it to the top of Up next.
  // The player has no insert-next request; one queue edit is accepted per published revision.
  const swipeSong = async (id: string, kind: 'queue' | 'next') => {
    const api = apiRef.current;
    const target = libraryEntriesRef.current.target(id);
    if (!api || target?.type !== 'Song') return;
    // Clear first so a repeated failure reads as a new message.
    setState((prev) => (prev.connectionMessage ? { ...prev, connectionMessage: null } : prev));
    if (kind === 'next' && !featureSetRef.current.has('queue_edit')) {
      setState((prev) => ({ ...prev, connectionMessage: 'This player can’t reorder its queue, so songs can only be added to the end.' }));
      return;
    }
    try {
      const readEnds = async () => {
        const head = await api.queue(0, QUEUE_PROBE_SIZE);
        const tail = head.total > QUEUE_PROBE_SIZE ? await api.queue(head.total - QUEUE_PROBE_SIZE, QUEUE_PROBE_SIZE) : null;
        return { ends: queueEnds(head, tail), revision: tail?.revision ?? head.revision };
      };
      const before = kind === 'next' ? await readEnds() : null;
      await api.addToQueue(target.song.index, target.catalogRevision);
      if (before) {
        let placed = false;
        for (let attempt = 0; attempt < SWIPE_NEXT_ATTEMPTS && !placed; attempt++) {
          await new Promise<void>((resolve) => setTimeout(resolve, SWIPE_NEXT_POLL_MS));
          if (api !== apiRef.current) return;
          const after = await readEnds();
          if (after.ends.total === before.ends.total) continue;
          // Move only the copy that was just added; a guess could move another song instead.
          const offset = insertedOffset(before.ends, after.ends, target.song.index);
          if (offset == null) break;
          try {
            if (offset > 0) await api.moveQueueTrack(offset, 0, after.revision);
            placed = true;
          } catch (err: any) {
            if (err?.statusCode !== 409) throw err;
            break;
          }
        }
        if (!placed) throw new Error('The song was added to the queue, but couldn’t be moved up next.');
      }
      if (api !== apiRef.current) return;
      setTimeout(() => { if (api === apiRef.current) refreshQueue(api); }, 350);
    } catch (err: any) {
      if (api !== apiRef.current) return;
      setState((prev) => ({ ...prev, connectionMessage: err?.message || 'Could not update the player' }));
    }
  };

  const loadBulkPlaylists = async () => {
    const api = apiRef.current;
    if (!api || !featureSetRef.current.has('playlist_edit')) return;
    setState((prev) => ({ ...prev, bulkPlaylistOptionsStatus: ContentStatus.Loading, bulkPlaylistOptions: [] }));
    try {
      const playlists = await api.playlists();
      if (api !== apiRef.current) return;
      setState((prev) => ({ ...prev, bulkPlaylistOptions: playlists, bulkPlaylistOptionsStatus: ContentStatus.Ready }));
    } catch (err: any) {
      if (api !== apiRef.current) return;
      setState((prev) => ({ ...prev, bulkPlaylistOptionsStatus: ContentStatus.Error, connectionMessage: err?.message || 'Could not load playlists' }));
    }
  };

  const cancelBulkAction = () => {
    // Cancellation is cooperative: retain busy ownership until the in-flight request settles.
    bulkActionCancelledRef.current = true;
  };

  const runBulkAction = async (action: Extract<RemoteAction, { type: 'RunBulkAction' }>) => {
    const api = apiRef.current;
    const reject = (message: string) => setState((prev) => ({ ...prev, bulkActionProgress: { action: action.action, completed: 0, total: 0, succeeded: 0, failed: 0, processed: 0, phase: 'error', message } }));
    if (!api || action.ids.length === 0) { reject('Select one or more items first.'); return; }
    if (bulkActionBusyRef.current) return;
    const feature = action.action === 'favorite' ? 'favorites_edit' : action.action === 'queue' || action.action === 'random' ? null : 'playlist_edit';
    if (feature && !featureSetRef.current.has(feature)) { reject('This player does not support that action.'); return; }
    if ((action.action === 'queue' || action.action === 'random') && !stateRef.current.currentTrack) {
      reject('Start a song before adding selected songs to the queue.');
      return;
    }
    const selectedTargets = action.ids.map((id) => libraryEntriesRef.current.target(id)).filter((target): target is EntryTarget => Boolean(target));
    if (selectedTargets.length === 0) { reject('The selection is no longer available. Select items again.'); return; }
    const name = action.action === 'createPlaylist' ? action.name?.trim() ?? '' : '';
    if (action.action === 'playlist' && !stateRef.current.bulkPlaylistOptions?.some((playlist) => playlist.key === action.key && playlist.writable)) { reject('Choose a writable playlist.'); return; }

    bulkActionBusyRef.current = true;
    bulkActionCancelledRef.current = false;
    const run = ++bulkActionRunRef.current;
    const playerKey = connectedPlayerKeyRef.current;
    const attempt = connectionAttemptRef.current;
    const catalogRevision = activeCatalogRef.current?.revision ?? null;
    const libraryGeneration = libraryLoadGenerationRef.current;
    const isCancelled = () => bulkActionCancelledRef.current || run !== bulkActionRunRef.current || api !== apiRef.current ||
      playerKey !== connectedPlayerKeyRef.current || attempt !== connectionAttemptRef.current ||
      catalogRevision !== (activeCatalogRef.current?.revision ?? null) || libraryGeneration !== libraryLoadGenerationRef.current;
    const ownsPlayer = () => api === apiRef.current && playerKey === connectedPlayerKeyRef.current && attempt === connectionAttemptRef.current;
    let completed = 0;
    let total = 0;
    let succeeded = 0;
    let failed = 0;
    let queueActionNeedsRefresh = false;
    const publish = (phase: 'resolving' | 'writing' | 'done' | 'cancelled' | 'error', message?: string, messageValues?: Record<string, string | number>) => {
      if (!ownsPlayer()) {
        if (phase !== 'resolving' && phase !== 'writing') abandonBulkProgress(action.action);
        return;
      }
      setState((prev) => ({ ...prev, bulkActionProgress: { action: action.action, completed, total, succeeded, failed, processed: completed, phase, message: message ?? null, messageValues } }));
    };
    const countValues = () => ({ succeeded, failed, processed: completed, total });

    try {
      publish('resolving');
      if (action.action === 'createPlaylist') {
        let playlists: Playlist[];
        try { playlists = await api.playlists(); }
        catch (error: any) {
          if (isCancelled()) publish('cancelled', 'Stopped. {succeeded} succeeded, {failed} failed, {processed} processed of {total}. Completed changes remain applied.', countValues());
          else publish('error', 'Could not load playlists.');
          return;
        }
        if (isCancelled()) { publish('cancelled', 'Stopped. {succeeded} succeeded, {failed} failed, {processed} processed of {total}. Completed changes remain applied.', countValues()); return; }
        const issue = playlistNameIssue(name, playlists.map((playlist) => playlist.name));
        if (!name || issue) { publish('error', issue || 'Enter a playlist name.'); return; }
      }
      const songs = await resolveBulkSongs(api, selectedTargets, isCancelled);
      total = songs.length;
      if (action.action === 'random') total = songs.length ? 1 : 0;
      if (isCancelled()) { publish('cancelled', 'Stopped. {succeeded} succeeded, {failed} failed, {processed} processed of {total}. Completed changes remain applied.', countValues()); return; }
      if (total === 0) { publish('done', 'No songs were found in the selected items.'); return; }
      publish('writing');
      let writeItems = songs;
      if (action.action === 'random') writeItems = [songs[Math.floor(Math.random() * songs.length)]];
      let queueSnapshot: Awaited<ReturnType<typeof readQueueSnapshot>> | null = null;
      let queueInsertCursor: number | null = null;
      let queueWriteMayComplete = false;
      const confirmQueueAppend = async (songIndex: number) => {
        if (!queueSnapshot) {
          queueSnapshot = await readQueueSnapshot((offset, limit) => api.queue(offset, limit), isCancelled);
          if (isCancelled()) throw new Error('Queue add was not confirmed before the action stopped.');
        }
        const before = queueSnapshot;
        // Reject stale queue state before issuing a command with no revision argument.
        const current = await api.queue(0, 25);
        if (isCancelled()) throw new Error('Queue add was not confirmed before the action stopped.');
        if (current.revision !== before.revision || current.total !== before.total) throw new Error('Queue changed. Remaining songs were stopped.');
        if (isCancelled()) throw new Error('Queue add was not confirmed before the action stopped.');
        queueActionNeedsRefresh = true;
        queueWriteMayComplete = true;
        await api.addToQueue(songIndex, catalogRevision);
        if (isCancelled()) throw new Error('Queue add was not confirmed before the action stopped.');
        if (queueInsertCursor != null) {
          const cursor = queueInsertCursor;
          const pageOffset = Math.max(0, cursor - 1);
          const limit = Math.min(3, before.total + 1 - pageOffset);
          const confirmedPage = await waitForQueueTransition(before, before.revision + 1,
            (observed) => observed.total === before.total + 1 && observed.offset === pageOffset &&
              queueInsertWindowMatches(before.songs, cursor, songIndex, observed.songs, pageOffset),
            async () => {
              const page = await api.queue(pageOffset, limit);
              return { revision: page.revision, total: page.total, songs: page.songs, offset: page.offset };
            }, isCancelled);
          if (isCancelled()) throw new Error('Queue add was not confirmed before the action stopped.');
          if (!confirmedPage) throw new Error('Queue add was accepted but could not be confirmed. Remaining songs were stopped.');
          const updated = [...before.songs];
          updated.splice(cursor, 0, { index: songIndex, title: '', artist: '', album: '' });
          queueSnapshot = { revision: confirmedPage.revision, total: confirmedPage.total, songs: updated };
          queueInsertCursor = cursor + 1;
        } else {
          let confirmed: Awaited<ReturnType<typeof readQueueSnapshot>> | null;
          try {
            confirmed = await waitForQueueTransition(before, before.revision + 1,
              (observed) => observed.total === before.total + 1 && queueInsertionOffsets(before.songs, observed.songs, songIndex).length > 0,
              () => readQueueSnapshot((offset, limit) => api.queue(offset, limit), isCancelled), isCancelled);
          } catch { throw new Error('Queue changed during add. Remaining songs were stopped.'); }
          if (isCancelled()) throw new Error('Queue add was not confirmed before the action stopped.');
          if (!confirmed) throw new Error('Queue add was accepted but could not be confirmed. Remaining songs were stopped.');
          const candidates = queueInsertionOffsets(before.songs, confirmed.songs, songIndex);
          queueSnapshot = confirmed;
          queueInsertCursor = candidates.length === 1 ? candidates[0] + 1 : null;
        }
        queueWriteMayComplete = false;
      };
      const write = async ({ song }: typeof writeItems[number]) => {
        if (action.action === 'favorite') await api.setFavorite(Boolean(action.favorite), song.index, catalogRevision);
        else if (action.action === 'queue' || action.action === 'random') await confirmQueueAppend(song.index);
        else if (action.action === 'playlist') await api.addToPlaylist(action.key!, song.index);
        else if (action.action === 'createPlaylist') await api.addToPlaylist(name, song.index);
      };
      const onProgress = (counts: { processed: number; succeeded: number; failed: number }) => {
        completed = counts.processed; succeeded = counts.succeeded; failed = counts.failed;
        if (completed % 5 === 0 || completed === total || failed > 0) publish('writing');
      };
      let result: BulkWriteCounts;
      if (action.action === 'createPlaylist') {
        const playlistJob = await runPlaylistCreationJob(() => api.createEmptyPlaylist(name), writeItems, isCancelled, write, onProgress);
        result = playlistJob.counts;
        if (!playlistJob.created && !isCancelled()) {
          publish('error', 'Playlist was not created; 0 songs added of {total}. {error} No existing playlist was changed.', { total, error: playlistJob.error instanceof Error ? playlistJob.error.message : '' });
          return;
        }
        if (playlistJob.created && result.processed === 0 && isCancelled()) {
          publish('cancelled', 'Playlist created; no songs were added.');
          return;
        }
      } else result = await runSerialBulkWrites(writeItems, isCancelled, write, onProgress);
      completed = result.processed; succeeded = result.succeeded; failed = result.failed;
      if (isCancelled()) publish('cancelled', queueWriteMayComplete
        ? 'Stopped. {succeeded} succeeded, {failed} failed, {processed} processed of {total}. The current queue add may still finish; refresh the queue before retrying.'
        : 'Stopped. {succeeded} succeeded, {failed} failed, {processed} processed of {total}. Completed changes remain applied.', countValues());
      else if (failed) publish('error', '{succeeded} succeeded, {failed} failed, {processed} processed of {total}. {error} Completed changes remain applied.', { ...countValues(), error: result.error instanceof Error ? result.error.message : '' });
      else publish('done', '{succeeded} succeeded, {failed} failed, {processed} processed of {total}.', countValues());
      if (action.action === 'createPlaylist' && ownsPlayer() && currentLibraryCategoryRef.current === LibraryCategory.Playlists && !stateRef.current.libraryIsNested) loadLibraryCategory(LibraryCategory.Playlists, api);
    } catch (err: any) {
      if (ownsPlayer()) publish(isCancelled() ? 'cancelled' : 'error', isCancelled()
        ? 'Stopped. {succeeded} succeeded, {failed} failed, {processed} processed of {total}. Completed changes remain applied.'
        : '{succeeded} succeeded, {failed} failed, {processed} processed of {total}. {error} Completed changes remain applied.', isCancelled() ? countValues() : { ...countValues(), error: err?.message || 'Could not complete the selected action.' });
    } finally {
      if (queueActionNeedsRefresh && ownsPlayer()) await refreshQueue(api);
      if (run === bulkActionRunRef.current) {
        bulkActionBusyRef.current = false;
        bulkActionCancelledRef.current = false;
      }
    }
  };

  const clearQueue = async () => {
    if (bulkActionBusyRef.current) return;
    const api = apiRef.current;
    if (!api || stateRef.current.queueTotal === 0) return;
    try {
      await api.clearQueue(queueRevisionRef.current);
      setTimeout(() => { if (api === apiRef.current) refreshQueue(api); }, 350);
    } catch (err: any) {
      if (api !== apiRef.current) return;
      if (err?.statusCode === 409) {
        setState((prev) => ({ ...prev, connectionMessage: 'The queue changed. Review it and try again.' }));
        await refreshQueue(api);
      } else {
        setState((prev) => ({ ...prev, connectionMessage: err?.message || 'Could not clear the queue' }));
      }
    }
  };

  const editQueue = async (id: string, direction?: -1 | 1) => {
    if (bulkActionBusyRef.current) return;
    const api = apiRef.current;
    const target = queueTargetsRef.current.get(id);
    if (!api || !target || !featureSetRef.current.has('queue_edit')) return;
    if (direction && (target.offset + direction < 0 || target.offset + direction >= stateRef.current.queueTotal)) return;
    try {
      if (direction) await api.moveQueueTrack(target.offset, target.offset + direction, target.revision);
      else await api.playQueueTrack(target.offset, target.revision);
      setTimeout(() => { if (api === apiRef.current) refreshQueue(api); }, 350);
    } catch (err: any) {
      if (api !== apiRef.current) return;
      setState((prev) => ({ ...prev, connectionMessage: err?.statusCode === 409
        ? 'The queue changed. Review it and try again.' : err?.message || 'Could not edit queue' }));
      refreshQueue(api);
    }
  };

  const setCurrentFavorite = async (favorite: boolean) => {
    const api = apiRef.current;
    if (!api || !featureSetRef.current.has('favorites_edit')) return;
    try {
      const saved = await api.setFavorite(favorite);
      if (api === apiRef.current) setState((prev) => ({ ...prev, currentFavorite: saved, connectionMessage: null }));
    } catch (err: any) {
      setState((prev) => ({ ...prev, connectionMessage: err?.message || 'Could not update favorite' }));
    }
  };

  const setSongFavorite = async (favorite: boolean) => {
    const api = apiRef.current;
    const target = songActionTargetRef.current;
    if (!api || !target || !featureSetRef.current.has('favorites_edit') || target.song.index < 1) return;
    try {
      const saved = await api.setFavorite(favorite, target.song.index, target.catalogRevision);
      if (api !== apiRef.current) return;
      setState((prev) => ({ ...prev, songActionFavorite: saved, connectionMessage: null }));
      if (currentLibraryCategoryRef.current === LibraryCategory.Favorites) {
        await loadLibraryCategory(LibraryCategory.Favorites, api);
      }
    } catch (err: any) {
      setState((prev) => ({ ...prev, connectionMessage: err?.message || 'Could not update favorite' }));
    }
  };

  const createEmptyPlaylist = async (name: string) => {
    const api = apiRef.current;
    if (!api || !featureSetRef.current.has('playlist_edit')) return;
    try {
      await api.createEmptyPlaylist(name.trim());
      if (api === apiRef.current) await loadLibraryCategory(LibraryCategory.Playlists, api);
    } catch (err: any) {
      setState((prev) => ({ ...prev, connectionMessage: err?.message || 'Could not create playlist' }));
    }
  };

  const editPlaylist = async (key: string, name?: string) => {
    const api = apiRef.current;
    if (!api || !featureSetRef.current.has('playlist_edit')) return;
    try {
      if (name != null) await api.renamePlaylist(key, name.trim());
      else await api.deletePlaylist(key);
      if (api === apiRef.current) await loadLibraryCategory(LibraryCategory.Playlists, api);
    } catch (err: any) {
      setState((prev) => ({ ...prev, connectionMessage: err?.message || 'Could not edit playlist' }));
    }
  };

  const editPlaylistTrack = async (direction?: -1 | 1) => {
    const api = apiRef.current;
    const playlist = activePlaylistRef.current;
    const song = songActionTargetRef.current?.song;
    const revision = stateRef.current.playlistRevision;
    if (!api || !playlist?.writable || !revision || song?.position == null ||
        !featureSetRef.current.has('playlist_edit')) return;
    try {
      if (direction) {
        const positions = stateRef.current.libraryEntries
          .map((entry) => entry.playlistPosition)
          .filter((position): position is number => position != null);
        const to = direction < 0
          ? positions.filter((position) => position < song.position!).at(-1)
          : positions.find((position) => position > song.position!);
        if (to == null) return;
        await api.movePlaylistTrack(playlist.key, song.position, to, revision);
      } else {
        await api.removePlaylistTrack(playlist.key, song.position, revision);
      }
      if (api === apiRef.current) {
        closeSongActions();
        await browsePlaylist(playlist);
      }
    } catch (err: any) {
      if (api !== apiRef.current) return;
      setState((prev) => ({ ...prev, connectionMessage: err?.statusCode === 409
        ? 'The playlist changed. Reload it and try again.' : err?.message || 'Could not edit playlist' }));
      if (err?.statusCode === 409) await browsePlaylist(playlist);
    }
  };

  const importPlaylist = async (name: string) => {
    const api = apiRef.current;
    if (!api || !featureSetRef.current.has('playlist_import')) return;
    try {
      const selection = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (selection.canceled || api !== apiRef.current) return;
      const asset = selection.assets[0];
      if (!asset || !/\.m3u8?$/i.test(asset.name)) throw new Error('Choose an M3U or M3U8 playlist file');
      if (asset.size != null && asset.size > 256 * 1024) throw new Error('Playlist file must be 256 KiB or smaller');
      const body = await new File(asset.uri).bytes();
      if (api !== apiRef.current) return;
      const result = await api.importPlaylist(name.trim(), body);
      if (api !== apiRef.current) return;
      await loadLibraryCategory(LibraryCategory.Playlists, api);
      Alert.alert('Playlist imported', `${result.matched} of ${result.entries} entries matched songs on this player.`);
    } catch (err: any) {
      if (api !== apiRef.current) return;
      setState((prev) => ({ ...prev, connectionMessage: err?.message || 'Could not import playlist' }));
    }
  };

  const wifiImportSession = () => {
    const api = apiRef.current;
    const endpoint = activeWifiEndpointRef.current;
    const attempt = connectionAttemptRef.current;
    const playerKey = connectedPlayerKeyRef.current;
    if (!api || !endpoint || !playerKey || stateRef.current.connectionStatus !== ConnectionStatus.Connected ||
        stateRef.current.connectionTransport !== ConnectionTransport.Wifi ||
        !featureSetRef.current.has('wifi_import') || !featureSetRef.current.has('wifi_import_files')) return null;
    return { api, endpoint, attempt, playerKey };
  };
  const ownsWifiImportSession = (session: NonNullable<ReturnType<typeof wifiImportSession>>) =>
    isCurrentWifiImportSession(session, {
      api: apiRef.current,
      attempt: connectionAttemptRef.current,
      playerKey: connectedPlayerKeyRef.current,
      endpoint: activeWifiEndpointRef.current,
      connected: stateRef.current.connectionStatus === ConnectionStatus.Connected,
      transport: stateRef.current.connectionTransport === ConnectionTransport.Wifi ? 'wifi' : 'bluetooth',
    });

  const refreshWifiImport = async () => {
    const session = wifiImportSession();
    if (!session) return;
    const operation = ++wifiImportOperationRef.current;
    try {
      const status = await session.api.importStatus();
      if (ownsWifiImportSession(session) && operation === wifiImportOperationRef.current) setWifiImportStatus({
        ...status, error: status.error ? wifiImportErrorMessage(status.error) : null,
      });
    } catch (err: any) {
      if (ownsWifiImportSession(session) && operation === wifiImportOperationRef.current) {
        setWifiImportStatus({ state: 'error', error: wifiImportErrorMessage(err) });
      }
    }
  };

  const cancelWifiImportOperation = useCallback(() => {
    wifiImportOperationRef.current++;
    wifiUpgradeScanCleanupRef.current?.();
    wifiUpgradeScanCleanupRef.current = null;
  }, []);

  const startWifiImportUpgrade = async () => {
    const currentApi = apiRef.current;
    const attempt = connectionAttemptRef.current;
    const playerKey = connectedPlayerKeyRef.current;
    const ownsBluetoothSession = () => apiRef.current === currentApi && connectionAttemptRef.current === attempt &&
      connectedPlayerKeyRef.current === playerKey && stateRef.current.connectionStatus === ConnectionStatus.Connected &&
      stateRef.current.connectionTransport === ConnectionTransport.Bluetooth;
    if (!currentApi || !ownsBluetoothSession() ||
        !featureSetRef.current.has('wifi_import') || !featureSetRef.current.has('wifi_import_files') ||
        !featureSetRef.current.has(RemoteApi.CATALOG_SYNC_FEATURE)) {
      throw new Error('Update the player firmware to use Wi-Fi import.');
    }
    cancelWifiImportOperation();
    const operation = wifiImportOperationRef.current;
    const isCurrent = () => ownsBluetoothSession() && operation === wifiImportOperationRef.current;
    const wifiPerms = getRequiredPermissionsForWifi();
    if (wifiPerms.length > 0) {
      const permResult = await requestMissingPermissions(wifiPerms);
      if (!isCurrent()) throw new Error('Wi-Fi player search was cancelled.');
      if (!permResult.granted) throw new Error('Grant Local Network permission to find the player on Wi-Fi.');
    }

    let expectedPublicLibraryId: string | null = null;
    try {
      const sourceCapabilities = await currentApi.capabilities({ omitPin: true });
      if (!isCurrent()) throw new Error('Wi-Fi player search was cancelled.');
      expectedPublicLibraryId = sourceCapabilities.libraryId ?? null;
    } catch (cause: any) {
      if (!isCurrent()) throw new Error('Wi-Fi player search was cancelled.');
      throw cause;
    }
    if (!expectedPublicLibraryId) throw new Error('The player does not expose a public library identity. Update the player firmware and try again.');

    const savedAddress = await AsyncStorage.getItem(PREF_WIFI_ADDRESS);
    if (!isCurrent()) throw new Error('Wi-Fi player search was cancelled.');
    if (savedAddress?.trim() && await tryUpgradeToWifi(currentApi, savedAddress, true, isCurrent, expectedPublicLibraryId)) return;
    if (!isCurrent()) throw new Error('Wi-Fi player search was cancelled.');

    await new Promise<void>((resolve, reject) => {
      let done = false;
      let scanActive = true;
      const attempted = new Set<string>();
      let candidateQueue = Promise.resolve();
      let timer: ReturnType<typeof setTimeout>;
      let cancelScan: () => void;
      const cleanup = () => {
        scanActive = false;
        subscription?.remove();
        void stopWifiDiscoveryModule().catch(() => {});
        clearTimeout(timer);
        if (wifiUpgradeScanCleanupRef.current === cancelScan) wifiUpgradeScanCleanupRef.current = null;
      };
      const finish = (error?: Error) => {
        if (done) return;
        done = true;
        cleanup();
        error ? reject(error) : resolve();
      };
      cancelScan = () => finish(new Error('Wi-Fi player search was cancelled.'));
      const subscription = addWifiDeviceFoundListener((service: DiscoveredWifiService) => {
        const endpoint = discoveryEndpoint(service);
        if (!endpoint || attempted.has(endpoint) || attempted.size >= 64 || !isCurrent()) return;
        attempted.add(endpoint);
        candidateQueue = candidateQueue.then(async () => {
          if (!isCurrent() || done) return;
          if (await tryUpgradeToWifi(currentApi, endpoint, true, () => isCurrent() && scanActive, expectedPublicLibraryId)) finish();
        }).catch(() => {});
      });
      timer = setTimeout(() => finish(new Error('Could not find the matching player. Turn on Wi-Fi on the player and phone, then try again.')), 15000);
      wifiUpgradeScanCleanupRef.current = cancelScan;
      void startWifiDiscoveryModule().then((started) => {
        if (!started && !done) finish(new Error('Wi-Fi discovery is unavailable. Check Wi-Fi and local network permission, then try again.'));
      }).catch(() => finish(new Error('Could not search for the player on Wi-Fi.')));
    });
  };

  const startWifiImport = async () => {
    const session = wifiImportSession();
    if (!session) throw new Error('Connect to the player over Wi-Fi to start file import.');
    const operation = ++wifiImportOperationRef.current;
    const isCurrent = () => ownsWifiImportSession(session) && operation === wifiImportOperationRef.current;
    try {
      let status = await session.api.importStatus();
      if (!isCurrent()) return;
      setWifiImportStatus({ ...status, error: status.error ? wifiImportErrorMessage(status.error) : null });
      if (status.state === 'stopped' || status.state === 'error') {
        await session.api.startImport();
        if (!isCurrent()) return;
      }
      setWifiImportStatus({ state: 'starting', error: null });
      for (let poll = 0; poll < 40; poll++) {
        if (!isCurrent()) return;
        status = await session.api.importStatus();
        if (!isCurrent()) return;
        setWifiImportStatus({ ...status, error: status.error ? wifiImportErrorMessage(status.error) : null });
        if (status.state === 'ready') return;
        if (status.state === 'error') throw new Error(status.error || 'The transfer service reported an error.');
        if (status.state === 'stopped') {
          await session.api.startImport();
          if (!isCurrent()) return;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      throw new Error('Wi-Fi import did not become ready in time.');
    } catch (err: any) {
      if (isCurrent()) setWifiImportStatus({ state: 'error', error: wifiImportErrorMessage(err) });
      throw err;
    }
  };

  const stopWifiImport = async () => {
    const session = wifiImportSession();
    if (!session) throw new Error('The Wi-Fi import session ended. Reconnect before finishing.');
    const operation = ++wifiImportOperationRef.current;
    const isCurrent = () => ownsWifiImportSession(session) && operation === wifiImportOperationRef.current;
    setWifiImportStatus((previous) => ({ ...previous, state: 'stopping', error: null }));
    try {
      await session.api.stopImport();
      if (!isCurrent()) return;
      for (let poll = 0; poll < 40; poll++) {
        if (!isCurrent()) return;
        const status = await session.api.importStatus();
        if (!isCurrent()) return;
        setWifiImportStatus({ ...status, error: status.error ? wifiImportErrorMessage(status.error) : null });
        if (status.state === 'stopped') {
          const api = session.api;
          await loadLibraryCategory(currentLibraryCategoryRef.current, api);
          refreshQueue(api);
          if (featureSetRef.current.has(RemoteApi.CATALOG_SYNC_FEATURE)) {
            startCatalogSync(api, connectionAttemptRef.current, [...featureSetRef.current]);
          }
          return;
        }
        if (status.state === 'error') throw new Error(status.error || 'The transfer service reported an error.');
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      throw new Error('The Wi-Fi import page did not stop in time.');
    } catch (err: any) {
      if (isCurrent()) setWifiImportStatus({ state: 'error', error: wifiImportErrorMessage(err) });
      throw err;
    }
  };

  const requireWifiImportSession = () => {
    const session = wifiImportSession();
    if (!session || !ownsWifiImportSession(session)) throw new Error('The Wi-Fi import session ended. Reopen import for the connected player.');
    return session;
  };
  const listWifiImportFiles = async (path: string, offset: number): Promise<WifiImportDirectoryPage> => {
    const session = requireWifiImportSession();
    const page = await session.api.importFiles(path, offset, 50);
    if (!ownsWifiImportSession(session)) throw new Error('The Wi-Fi import session ended.');
    return page;
  };
  const uploadWifiImportFile = async (
    uri: string, path: string, name: string, onProgress: (sent: number, total: number) => void, signal: AbortSignal,
  ): Promise<void> => {
    const session = requireWifiImportSession();
    await session.api.uploadImportFile(session.endpoint, uri, path, name,
      ({ sent, total }) => { if (ownsWifiImportSession(session) && !signal.aborted) onProgress(sent, total); }, signal);
    if (!ownsWifiImportSession(session)) throw new Error('The Wi-Fi import session ended.');
  };
  const renameWifiImportFile = async (path: string, name: string) => {
    const session = requireWifiImportSession();
    await session.api.renameImportFile(path, name);
    if (!ownsWifiImportSession(session)) throw new Error('The Wi-Fi import session ended.');
  };
  const deleteWifiImportFile = async (path: string) => {
    const session = requireWifiImportSession();
    await session.api.deleteImportFile(path);
    if (!ownsWifiImportSession(session)) throw new Error('The Wi-Fi import session ended.');
  };
  /** Creates an SD card folder; an existing folder of the same name is reused. */
  const createWifiImportDirectory = async (path: string, name: string) => {
    const session = requireWifiImportSession();
    try {
      await session.api.createImportDirectory(path, name);
    } catch (err: any) {
      if (err?.statusCode !== 409 || !String(err?.responseBody ?? '').includes('name_exists')) throw err;
    }
    if (!ownsWifiImportSession(session)) throw new Error('The Wi-Fi import session ended.');
  };

  const loadLibraryArtwork = async (entryId: string) => {
    const requestApi = apiRef.current;
    const requestAttempt = connectionAttemptRef.current;
    const requestPlayerScope = connectedPlayerKeyRef.current;
    const requestCatalog = activeCatalogRef.current;
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

    const target = libraryEntriesRef.current.target(entryId);
    if (!target) return;

    let albumKey: string | null = null;
    let songIndex: number | null = null;

    if (target.type === 'Song') {
      albumKey = target.song.albumKey ?? null;
      songIndex = target.song.index;
    } else if (target.type === 'Album' || target.type === 'Group') {
      albumKey = target.group.albumKey ?? null;
      songIndex = target.group.index;
    }

    const sources = artworkSources(requestApi);
    const uri = await resolveArtworkUri({ albumKey, songIndex }, sources);
    const currentCatalog = activeCatalogRef.current;
    if (
      apiRef.current !== requestApi ||
      connectionAttemptRef.current !== requestAttempt ||
      connectedPlayerKeyRef.current !== requestPlayerScope ||
      currentCatalog?.libraryId !== requestCatalog?.libraryId ||
      currentCatalog?.revision !== requestCatalog?.revision
    ) return;
    if (uri) libraryArtwork.queue(entryId, uri);
  };

  const artworkSources = (network: RemoteApi | null): ArtworkSources => ({
    catalog: activeCatalogRef.current,
    coverUrisByAlbum: syncedCoverUriCacheRef.current,
    coversByAlbum: catalogCoversByAlbumRef.current,
    coverStore: syncedCoverStoreRef.current,
    artCache: artCacheRef.current,
    network,
    playerScope: connectedPlayerKeyRef.current,
    isCurrent: (() => {
      const ownerApi = apiRef.current;
      const ownerAttempt = connectionAttemptRef.current;
      const ownerPlayerScope = connectedPlayerKeyRef.current;
      const ownerCatalog = activeCatalogRef.current;
      const ownerCoverMap = catalogCoversByAlbumRef.current;
      const ownerCoverUriMap = syncedCoverUriCacheRef.current;
      return () =>
        apiRef.current === ownerApi &&
        connectionAttemptRef.current === ownerAttempt &&
        connectedPlayerKeyRef.current === ownerPlayerScope &&
        activeCatalogRef.current?.libraryId === ownerCatalog?.libraryId &&
        activeCatalogRef.current?.revision === ownerCatalog?.revision &&
        catalogCoversByAlbumRef.current === ownerCoverMap &&
        syncedCoverUriCacheRef.current === ownerCoverUriMap;
    })(),
  });

  const allowsQueueArtworkRequests = () => {
    const transport = stateRef.current.connectionTransport;
    const audioOutput = bluetoothAudioOutputRef.current;
    return (
      BluetoothRequestPolicy.allowsPassiveRequests(transport, appForegroundRef.current, audioOutput) &&
      BluetoothRequestPolicy.allowsArtworkRequest(transport, stateRef.current.isPlaying, audioOutput) &&
      !BluetoothRequestPolicy.requiresBluetoothAudioPriority(transport, audioOutput)
    );
  };

  const loadQueueArtwork = async (songIndexes: number[], api: RemoteApi) => {
    const catalog = activeCatalogRef.current;
    const playerScope = connectedPlayerKeyRef.current;
    const requestAttempt = connectionAttemptRef.current;
    const sources = artworkSources(api);
    for (const songIndex of new Set(songIndexes)) {
      if (songIndex < 0 || queueArtworkBySongRef.current.has(songIndex)) continue;
      if (apiRef.current !== api) return;
      const albumKey = catalog
        ? await syncedCatalogStoreRef.current.albumKeyForSong(catalog.libraryId, catalog.revision, songIndex).catch(() => null)
        : null;
      if (
        apiRef.current !== api ||
        connectedPlayerKeyRef.current !== playerScope ||
        connectionAttemptRef.current !== requestAttempt ||
        activeCatalogRef.current?.libraryId !== catalog?.libraryId ||
        activeCatalogRef.current?.revision !== catalog?.revision
      ) return;
      const uri = await resolveArtworkUri(
        { albumKey, songIndex },
        { ...sources, network: allowsQueueArtworkRequests() ? api : null },
      );
      const currentCatalog = activeCatalogRef.current;
      if (
        apiRef.current !== api ||
        connectedPlayerKeyRef.current !== playerScope ||
        connectionAttemptRef.current !== requestAttempt ||
        currentCatalog?.libraryId !== catalog?.libraryId ||
        currentCatalog?.revision !== catalog?.revision
      ) return;
      if (!uri) continue;
      queueArtworkBySongRef.current.set(songIndex, uri);
      queueArtworkPendingRef.current.set(songIndex, uri);
      scheduleQueueArtworkFlush();
    }
  };

  // Covers resolve one by one; applying each with its own state update re-rendered the whole app
  // (and every visible queue row) up to 25 times per page. Apply them together instead.
  const scheduleQueueArtworkFlush = () => {
    if (queueArtworkFlushTimerRef.current) return;
    queueArtworkFlushTimerRef.current = setTimeout(() => {
      queueArtworkFlushTimerRef.current = null;
      const resolved = queueArtworkPendingRef.current;
      if (!resolved.size) return;
      queueArtworkPendingRef.current = new Map();
      setState((prev) => {
        let changed = false;
        const queue = prev.queue.map((track) => {
          const songIndex = queueTargetsRef.current.get(track.id)?.songIndex;
          const uri = songIndex == null ? undefined : resolved.get(songIndex);
          if (!uri || track.artwork === uri) return track;
          changed = true;
          return { ...track, artwork: uri };
        });
        return changed ? { ...prev, queue } : prev;
      });
    }, QUEUE_ARTWORK_FLUSH_MS);
  };

  const navigateBack = () => {
    if (stateRef.current.screen.type === 'Queue') {
      const screenUnderQueue = screenBackStackRef.current.pop() ?? { type: 'Home' };
      setState((curr) => ({ ...curr, screen: screenUnderQueue }));
      return;
    }

    if (stateRef.current.libraryIsNested && libraryBackStackRef.current.length > 0) {
      const prev = libraryBackStackRef.current.pop()!;
      currentLibraryCategoryRef.current = prev.category;
      libraryContextRef.current = prev.context;
      libraryPageRef.current = prev.page;
      extensionPageRef.current = prev.extensionPage;
      activePlaylistRef.current = prev.activePlaylist;
      shownLibraryListRef.current = prev.listKey;
      libraryLoadGenerationRef.current++;
      setState((curr) => ({
        ...curr,
        libraryEntries: prev.entries,
        libraryQuery: prev.query,
        libraryStatus: prev.status,
        libraryCountLabel: prev.countLabel,
        libraryHasMore: prev.hasMore,
        libraryIsNested: prev.isNested,
        libraryNestedTitle: prev.nestedTitle,
        activePlaylist: prev.activePlaylist,
        playlistRevision: prev.playlistRevision,
        folderPath: prev.folderPath,
        folderRoot: prev.folderRoot,
      }));
      if (prev.sortEpoch !== sortingEpochRef.current && apiRef.current) refreshSortedView(apiRef.current, prev.context, prev.isNested, prev.nestedTitle);
      return;
    }

    if (screenBackStackRef.current.length > 0) {
      const prevScreen = screenBackStackRef.current.pop()!;
      setState((curr) => ({ ...curr, screen: prevScreen, libraryIsNested: false }));
      if (
        prevScreen.type === 'Library' &&
        prevScreen.category !== LibraryCategory.Search &&
        prevScreen.category !== currentLibraryCategoryRef.current
      ) {
        loadLibraryCategory(prevScreen.category);
      }
      return;
    }

    setState((curr) => ({ ...curr, screen: { type: 'Home' }, libraryIsNested: false }));
  };

  const onAction = useCallback(async (action: RemoteAction) => {
    // Check runtime permissions matching Android MainActivity
    const requiredPerms = getRequiredPermissionsForAction(
      action,
      stateRef.current.selectedConnectionTransport
    );
    if (requiredPerms.length > 0) {
      const permResult = await requestMissingPermissions(requiredPerms);
      if (!permResult.granted) {
        const isBt = requiredPerms.some((p) => p.includes('BLUETOOTH') || p.includes('LOCATION'));
        const isWifi = requiredPerms.some((p) => p.includes('LOCAL_NETWORK'));
        const msg = isBt
          ? 'Bluetooth permissions were denied. Grant Nearby devices permission in Settings.'
          : 'Local network permission was denied. Grant Local Network permission in Settings.';

        setState((prev) => ({
          ...prev,
          connectionMessage: msg,
          ...(isBt && (action.type === 'ScanBluetoothPlayers' || action.type === 'OpenConnection')
            ? { bluetoothScanStatus: ContentStatus.Error }
            : {}),
          ...(isWifi && (action.type === 'RetryWifiDiscovery' || action.type === 'OpenConnection')
            ? { wifiDiscoveryStatus: ContentStatus.Error }
            : {}),
          ...(action.type === 'Connect' || action.type === 'RetryConnection' || action.type === 'SubmitPin'
            ? { connectionStatus: ConnectionStatus.Error }
            : {}),
        }));
        return;
      }
    }

    switch (action.type) {
      case 'StartAutoReconnect':
        if (autoReconnectEnabledRef.current) {
          if (autoReconnectTimerRef.current) {
            clearTimeout(autoReconnectTimerRef.current);
            autoReconnectTimerRef.current = null;
          }
          scheduleAutoReconnect(0);
        }
        break;

      case 'SetTheme':
        AsyncStorage.setItem(PREF_THEME, THEME_PREFERENCES[action.theme]).catch(() => {});
        setState((prev) => ({ ...prev, theme: action.theme }));
        break;

      case 'OpenHome':
        if (stateRef.current.screen.type !== 'Home') {
          screenBackStackRef.current = [];
          libraryBackStackRef.current = [];
          setState((prev) => ({ ...prev, screen: { type: 'Home' }, libraryIsNested: false }));
        }
        break;

      case 'OpenTransfer':
        if (stateRef.current.screen.type !== 'Transfer') {
          screenBackStackRef.current.push(stateRef.current.screen);
          setState((prev) => ({ ...prev, screen: { type: 'Transfer' } }));
        }
        break;

      case 'OpenConnection':
        if (stateRef.current.screen.type !== 'Connection') {
          screenBackStackRef.current.push(stateRef.current.screen);
          setState((prev) => ({ ...prev, screen: { type: 'Connection' } }));
        }
        break;

      case 'OpenLibrary': {
        const cat = action.category;
        if (searchDebounceTimerRef.current) clearTimeout(searchDebounceTimerRef.current);
        const targetScreen: RemoteScreen = { type: 'Library', category: cat };
        if (stateRef.current.screen.type !== 'Library' || stateRef.current.screen.category !== cat) {
          screenBackStackRef.current.push(stateRef.current.screen);
        }
        libraryBackStackRef.current = [];
        setState((prev) => ({ ...prev, screen: targetScreen, libraryIsNested: false }));
        loadLibraryCategory(cat);
        break;
      }

      case 'RefreshLibrary':
        loadLibraryCategory(action.category, undefined, null, true);
        break;

      case 'SyncLibrary': {
        const api = apiRef.current;
        if (api) startCatalogSync(api, connectionAttemptRef.current, [...featureSetRef.current]);
        break;
      }

      case 'OpenQueue':
        if (stateRef.current.screen.type !== 'Queue') {
          screenBackStackRef.current.push(stateRef.current.screen);
          setState((prev) => ({ ...prev, screen: { type: 'Queue' } }));
          refreshQueue();
        }
        break;

      case 'Back':
        navigateBack();
        break;

      case 'Connect':
      case 'RetryConnection':
        connect();
        break;

      case 'Disconnect':
        autoReconnectEnabledRef.current = false;
        AsyncStorage.setItem(PREF_AUTO_RECONNECT, 'false').catch(() => {});
        disconnect();
        break;

      case 'SetWifiAddress':
        wifiAddressEditedRef.current = true;
        setState((prev) => ({ ...prev, wifiAddress: action.address }));
        break;

      case 'SelectWifiPlayer': {
        const p = stateRef.current.wifiPlayers.find((x) => x.id === action.id);
        if (p) {
          wifiAddressEditedRef.current = true;
          AsyncStorage.setItem(PREF_WIFI_ADDRESS, p.address).catch(() => {});
          setState((prev) => ({ ...prev, wifiAddress: p.address }));
        }
        break;
      }

      case 'RetryWifiDiscovery':
        startWifiDiscovery();
        break;

      case 'SelectConnectionTransport':
        setState((prev) => ({ ...prev, selectedConnectionTransport: action.transport }));
        break;

      case 'ScanBluetoothPlayers': {
        const btPerms = getRequiredPermissionsForBluetooth();
        const permResult = await requestMissingPermissions(btPerms);
        if (!permResult.granted) {
          setState((prev) => ({
            ...prev,
            bluetoothScanStatus: ContentStatus.Error,
            connectionMessage:
              'Bluetooth permissions were denied. Grant Nearby devices permission in Settings.',
          }));
          break;
        }
        setState((prev) => ({ ...prev, bluetoothPlayers: [], bluetoothScanStatus: ContentStatus.Loading }));
        startBtDiscovery().then((started) => {
          if (!started) setState((prev) => ({ ...prev, bluetoothScanStatus: ContentStatus.Empty }));
        }).catch(() => {
          setState((prev) => ({ ...prev, bluetoothScanStatus: ContentStatus.Error }));
        });
        break;
      }

      case 'SelectBluetoothPlayer':
        AsyncStorage.setItem(PREF_BLUETOOTH_ID, action.id).catch(() => {});
        setState((prev) => ({ ...prev, selectedBluetoothPlayerId: action.id }));
        break;

      case 'PairBluetoothPlayer': {
        const btPerms = getRequiredPermissionsForBluetooth();
        const permResult = await requestMissingPermissions(btPerms);
        if (!permResult.granted) {
          setState((prev) => ({
            ...prev,
            connectionMessage:
              'Bluetooth permissions were denied. Grant Nearby devices permission in Settings.',
          }));
          break;
        }
        pairBtDevice(action.id).catch((err: any) => {
          setState((prev) => ({ ...prev, connectionMessage: err?.message || 'Could not pair with this player.' }));
        });
        break;
      }

      case 'SetPinInput':
        setState((prev) => ({ ...prev, pinInput: action.value, pinError: null }));
        break;

      case 'SubmitPin':
        if (/^[0-9]{4,12}$/.test(stateRef.current.pinInput)) {
          connect(stateRef.current.pinInput);
        } else {
          setState((prev) => ({ ...prev, pinError: 'Enter 4 to 12 digits' }));
        }
        break;

      case 'DismissPin':
        setState((prev) => ({ ...prev, pinDialogVisible: false, pinInput: '', pinError: null }));
        break;

      case 'ChangePin':
        setState((prev) => ({ ...prev, pinDialogVisible: true, pinInput: '', pinError: null }));
        break;

      case 'TogglePlayback': {
        const api = apiRef.current;
        if (!api) return;
        const nextPlaying = !stateRef.current.isPlaying;
        latestPlayingRef.current = nextPlaying;
        const token = gateRef.current.beginAction();
        api.preemptArtworkRequest();
        setState((prev) => ({ ...prev, isPlaying: nextPlaying }));
        api.togglePlayback()
          .then(() => {
            gateRef.current.finishAction(token, CommandOutcome.Succeeded, Date.now());
          })
          .catch(() => {
            gateRef.current.finishAction(token, CommandOutcome.Failed, Date.now());
          });
        break;
      }

      case 'Play':
      case 'Pause':
      case 'SetPlaying': {
        const targetPlaying =
          action.type === 'Play' ? true : action.type === 'Pause' ? false : action.playing;
        if (stateRef.current.isPlaying === targetPlaying) {
          // Idempotent: already in desired state
          return;
        }
        const api = apiRef.current;
        if (!api) return;
        latestPlayingRef.current = targetPlaying;
        const token = gateRef.current.beginExplicitAction(targetPlaying);
        api.preemptArtworkRequest();
        setState((prev) => ({ ...prev, isPlaying: targetPlaying }));
        api.togglePlayback()
          .then(() => {
            gateRef.current.finishAction(token, CommandOutcome.Succeeded, Date.now());
          })
          .catch(() => {
            gateRef.current.finishAction(token, CommandOutcome.Failed, Date.now());
          });
        break;
      }

      case 'Previous': {
        const api = apiRef.current;
        if (!api) return;
        // Clear first so a repeated failure reads as a new message.
        setState((prev) => (prev.connectionMessage ? { ...prev, connectionMessage: null } : prev));
        api.previous().catch(() => {
          if (apiRef.current === api) setState((prev) => ({ ...prev, connectionMessage: 'Could not skip to the previous song.' }));
        });
        break;
      }

      case 'Next': {
        const api = apiRef.current;
        if (!api) return;
        // Clear first so a repeated failure reads as a new message.
        setState((prev) => (prev.connectionMessage ? { ...prev, connectionMessage: null } : prev));
        api.next().catch(() => {
          if (apiRef.current === api) setState((prev) => ({ ...prev, connectionMessage: 'Could not skip to the next song.' }));
        });
        break;
      }

      case 'ToggleShuffle':
      case 'CycleRepeatMode': {
        const api = apiRef.current;
        if (!api) return;
        const current = stateRef.current.playbackMode;
        const supported = featureSetRef.current.has('shuffle_modes');
        if (action.type === 'ToggleShuffle' && !isShuffleMode(current)) lastNonShuffleModeRef.current = current;
        const target = action.type === 'ToggleShuffle'
          ? toggleShuffleMode(current, supported, lastNonShuffleModeRef.current)
          : toggleRepeatMode(current, supported);
        if (!isShuffleMode(target)) lastNonShuffleModeRef.current = target;
        setState((prev) => ({ ...prev, playbackMode: target }));
        const attempt = connectionAttemptRef.current;
        api.setPlayMode(toNumeric(target, supported)).catch((error) => {
          if (api === apiRef.current && attempt === connectionAttemptRef.current) setState((prev) => ({ ...prev, playbackMode: current, connectionMessage: error.message }));
        });
        break;
      }
      case 'SetLibrarySorting':
        void setLibrarySorting(action.scope, action.mode);
        break;
      case 'PlayCollection':
        void playNativeCollection(action.shuffle);
        break;

      case 'SeekTo': {
        const api = apiRef.current;
        if (!api) return;
        const targetPositionMs = Math.max(0, action.positionMs);
        const attempt = connectionAttemptRef.current;
        const pendingSeek = {
          positionMs: targetPositionMs,
          startedAtMs: Date.now(),
          commandCompletedAtMs: null as number | null,
        };
        pendingSeekRef.current = pendingSeek;
        api.preemptArtworkRequest();
        positionStoreRef.current.setPosition(targetPositionMs);
        setState((prev) => (prev.connectionMessage == null ? prev : { ...prev, connectionMessage: null }));
        api.seek(Math.round(targetPositionMs / 1000)).then(() => {
          if (attempt !== connectionAttemptRef.current || api !== apiRef.current) return;
          pendingSeek.commandCompletedAtMs = Date.now();
          startPollingLoop();
        }).catch((err: any) => {
          if (attempt !== connectionAttemptRef.current || api !== apiRef.current) return;
          if (pendingSeekRef.current === pendingSeek) pendingSeekRef.current = null;
          setState((prev) => ({ ...prev, connectionMessage: err?.message || 'Could not seek playback.' }));
          startPollingLoop();
        });
        break;
      }

      case 'SetVolume': {
        const api = apiRef.current;
        if (!api) return;
        const volume = normalizedVolume(action.volume);
        const attempt = connectionAttemptRef.current;
        const pendingVolume = {
          volume,
          commandCompletedAtMs: null as number | null,
          expiresAtMs: Date.now() + 8000,
        };
        pendingVolumeRef.current = pendingVolume;
        api.preemptArtworkRequest();
        setState((prev) => ({ ...prev, volume, connectionMessage: null }));
        api.setVolume(Math.floor(volume * 100)).then(() => {
          if (attempt !== connectionAttemptRef.current || api !== apiRef.current) return;
          pendingVolume.commandCompletedAtMs = Date.now();
          startPollingLoop();
        }).catch((err: any) => {
          if (attempt !== connectionAttemptRef.current || api !== apiRef.current) return;
          if (pendingVolumeRef.current === pendingVolume) pendingVolumeRef.current = null;
          setState((prev) => ({ ...prev, connectionMessage: err?.message || 'Could not change volume.' }));
          startPollingLoop();
        });
        break;
      }

      case 'SearchLibrary': {
        const term = action.query.trim();
        if (searchDebounceTimerRef.current) clearTimeout(searchDebounceTimerRef.current);
        const currentCategory = currentLibraryCategoryRef.current;
        if (term && currentCategory !== LibraryCategory.Search) {
          searchReturnCategoryRef.current = currentCategory;
        }
        const targetCategory = term ? LibraryCategory.Search
          : currentCategory === LibraryCategory.Search ? searchReturnCategoryRef.current : currentCategory;
        const screen = stateRef.current.screen;
        const enteringSearch = targetCategory === LibraryCategory.Search &&
          !(screen.type === 'Library' && screen.category === LibraryCategory.Search);
        if (enteringSearch) shownLibraryListRef.current = null;
        if (screen.type !== 'Library' || screen.category !== targetCategory) {
          setState((prev) => ({
            ...prev,
            screen: { type: 'Library', category: targetCategory },
            ...(enteringSearch ? { libraryEntries: [], libraryStatus: ContentStatus.Loading } : {}),
          }));
        }
        if (term) {
          searchDebounceTimerRef.current = setTimeout(() => {
            loadLibraryCategory(targetCategory, undefined, term);
          }, 300);
        } else if (shownLibraryListRef.current !== libraryListKey(librarySource(), targetCategory)) {
          loadLibraryCategory(targetCategory);
        }
        break;
      }

      case 'SelectLibraryEntry':
        selectLibraryEntry(action.id);
        break;

      case 'LoadLibraryArtwork':
        loadLibraryArtwork(action.entryId);
        break;

      case 'LoadMoreLibrary': {
        const api = apiRef.current;
        if (!api || !stateRef.current.libraryHasMore || libraryPageLoadingRef.current) return;
        if (extensionPageRef.current) {
          const cursor = extensionPageRef.current;
          libraryPageLoadingRef.current = true;
          setState((prev) => ({ ...prev, libraryStatus: ContentStatus.Loading }));
          try {
            let entries: LibraryEntry[] = [];
            let nextOffset = cursor.nextOffset;
            let total = cursor.total;
            if (cursor.kind === 'folder') {
              const page = await api.folder(cursor.path || '', cursor.nextOffset, cursor.root || 'sd');
              entries = libraryEntriesRef.current.folderItems(
                page.entries,
                cursor.root || 'sd',
                cursor.path || '',
                stateRef.current.libraryEntries
              );
              nextOffset = page.nextOffset;
              total = page.total;
            } else if (cursor.kind === 'recent') {
              const page = await api.recent(cursor.nextOffset);
              entries = libraryEntriesRef.current.songs(
                page.songs,
                { playlist: '@recently_played' },
                undefined,
                stateRef.current.libraryEntries
              );
              nextOffset = page.nextOffset;
              total = page.total;
            } else if (cursor.key) {
              const page = await api.playlistPage(cursor.key, cursor.nextOffset);
              if (stateRef.current.playlistRevision && page.revision && page.revision !== stateRef.current.playlistRevision) {
                if (activePlaylistRef.current) await browsePlaylist(activePlaylistRef.current);
                else await loadLibraryCategory(LibraryCategory.Favorites, api);
                return;
              }
              entries = libraryEntriesRef.current.songs(
                page.songs,
                { playlist: cursor.key! },
                undefined,
                stateRef.current.libraryEntries
              );
              nextOffset = page.nextOffset;
              total = page.total;
            }
            if (api !== apiRef.current || extensionPageRef.current !== cursor) return;
            extensionPageRef.current = { ...cursor, nextOffset, total };
            setState((prev) => ({
              ...prev,
              libraryEntries: [...prev.libraryEntries, ...entries],
              libraryHasMore: nextOffset > cursor.nextOffset && nextOffset < total,
              libraryStatus: ContentStatus.Ready,
            }));
          } catch (err: any) {
            setState((prev) => ({ ...prev, libraryStatus: ContentStatus.Error, connectionMessage: err?.message || 'Could not load more items' }));
          } finally {
            libraryPageLoadingRef.current = false;
          }
        } else if (stateRef.current.libraryIsNested && libraryPageRef.current) {
          const page = libraryPageRef.current;
          startSongPage(page.filter, page.playContext, page.albumKey, true, page.albumIdentity);
        } else if (currentLibraryCategoryRef.current === LibraryCategory.Songs ||
                   currentLibraryCategoryRef.current === LibraryCategory.Search) {
          libraryPageLoadingRef.current = true;
          setState((prev) => ({ ...prev, libraryStatus: ContentStatus.Loading }));
          const isSearch = currentLibraryCategoryRef.current === LibraryCategory.Search;
          const shown = stateRef.current.libraryEntries;
          const offset = isSearch ? shown.filter((entry) => entry.kind === 'song').length : shown.length;
          const generation = libraryLoadGenerationRef.current;
          const source = librarySource();
          try {
            const page = await loadSongsAfter(
              libraryLoadContext(api),
              shown,
              offset,
              stateRef.current.libraryQuery.trim() || null
            );
            if (generation !== libraryLoadGenerationRef.current) return;
            const all = [...shown, ...page.entries];
            const list: LibraryList = {
              entries: all,
              total: page.total,
              hasMore: offset + page.entries.length < page.total,
              label: isSearch
                ? `${shown.length - offset} groups · ${page.total} tracks`
                : `Showing ${all.length} of ${page.total} tracks`,
              extensionPage: null,
            };
            if (!isSearch && shownLibraryListRef.current === libraryListKey(source, LibraryCategory.Songs)) {
              libraryListCacheRef.current.set(source, LibraryCategory.Songs, list);
            }
            setState((prev) => ({
              ...prev,
              libraryEntries: all,
              libraryHasMore: list.hasMore,
              libraryStatus: ContentStatus.Ready,
              libraryCountLabel: list.label,
            }));
          } catch {
            setState((prev) => ({ ...prev, libraryStatus: ContentStatus.Error }));
          } finally {
            libraryPageLoadingRef.current = false;
          }
        }
        break;
      }

      case 'LoadMoreQueue':
        loadMoreQueue();
        break;

      case 'RemoveQueueTrack':
        removeQueueTrack(action.id);
        break;

      case 'RemoveQueueTracks':
        removeQueueTracks(action.ids);
        break;

      case 'OpenSongActions':
        openSongActions(action.id);
        break;

      case 'LoadSongPlaylists':
        loadSongPlaylists();
        break;

      case 'CloseSongActions':
        closeSongActions();
        break;

      case 'AddSongToQueue':
        runSongAction('queue');
        break;

      case 'SwipeSongAction':
        swipeSong(action.id, action.action);
        break;

      case 'AddSongToPlaylist':
        runSongAction('playlist', action.key);
        break;

      case 'CreatePlaylistWithSong':
        runSongAction('create', action.name);
        break;

      case 'ClearQueue':
        clearQueue();
        break;

      case 'MoveQueueTrack':
        editQueue(action.id, action.direction);
        break;

      case 'PlayQueueTrack':
        editQueue(action.id);
        break;

      case 'SetCurrentFavorite':
        setCurrentFavorite(action.favorite);
        break;

      case 'SetSongFavorite':
        setSongFavorite(action.favorite);
        break;

      case 'CreateEmptyPlaylist':
        createEmptyPlaylist(action.name);
        break;

      case 'RenamePlaylist':
        editPlaylist(action.key, action.name);
        break;

      case 'DeletePlaylist':
        editPlaylist(action.key);
        break;

      case 'RemovePlaylistTrack':
        editPlaylistTrack();
        break;

      case 'MovePlaylistTrack':
        editPlaylistTrack(action.direction);
        break;

      case 'ImportPlaylist':
        importPlaylist(action.name);
        break;

      case 'LoadBulkPlaylists':
        loadBulkPlaylists();
        break;

      case 'RunBulkAction':
        runBulkAction(action);
        break;

      case 'CancelBulkAction':
        cancelBulkAction();
        break;
    }
  }, []);

  return {
    state,
    onAction,
    wifiImportStatus,
    wifiImportOwnerKey: wifiImportOwnerKeyRef.current,
    refreshWifiImport,
    cancelWifiImportOperation,
    startWifiImport,
    stopWifiImport,
    startWifiImportUpgrade,
    listWifiImportFiles,
    uploadWifiImportFile,
    renameWifiImportFile,
    deleteWifiImportFile,
    createWifiImportDirectory,
    playbackPosition: positionStoreRef.current,
    currentLibraryCategory: currentLibraryCategoryRef.current,
    libraryArtwork,
  };
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
