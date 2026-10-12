import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
import { PlaybackPositionStore } from './PlaybackPositionStore';
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

const normalizedVolume = (value: number | null | undefined): number =>
  Number.isFinite(value) ? Math.max(0, Math.min(1, value as number)) : 0.68;

interface QueueTarget {
  offset: number;
  revision: number;
  songIndex: number;
}

interface LibrarySnapshot {
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
  page: { filter: LibraryFilter; playContext: PlayContext; albumKey: string | null } | null;
  extensionPage: ExtensionPage | null;
  listKey: string | null;
  activePlaylist: Playlist | null;
  playlistRevision: string | null;
  folderPath: string;
  folderRoot: string;
}

export function useRemoteSession() {
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
  });

  const apiRef = useRef<RemoteApi | null>(null);
  const connectedPlayerKeyRef = useRef<string | null>(null);
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
  const libraryPageRef = useRef<{ filter: LibraryFilter; playContext: PlayContext; albumKey: string | null } | null>(null);
  const extensionPageRef = useRef<LibrarySnapshot['extensionPage']>(null);
  const activePlaylistRef = useRef<Playlist | null>(null);
  const featureSetRef = useRef<Set<string>>(new Set());
  const libraryPageLoadingRef = useRef(false);
  const currentLibraryCategoryRef = useRef<LibraryCategory>(LibraryCategory.Artists);
  const searchReturnCategoryRef = useRef<LibraryCategory>(LibraryCategory.Artists);
  const libraryLoadGenerationRef = useRef(0);
  const queueRevisionRef = useRef<number>(0);
  const songActionEntryIdRef = useRef<string | null>(null);
  const songActionTargetRef = useRef<Extract<EntryTarget, { type: 'Song' }> | null>(null);
  const songActionBusyRef = useRef(false);

  const connectionAttemptRef = useRef<number>(0);
  const catalogSyncGenerationRef = useRef<number>(0);
  const pollingTimerRef = useRef<any>(null);
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
      if (searchDebounceTimerRef.current) clearTimeout(searchDebounceTimerRef.current);
      libraryArtwork.dispose();
      stopWifiDiscoveryModule().catch(() => {});
      stopBtDiscovery().catch(() => {});
    };
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      appForegroundRef.current = nextState === 'active';
    });
    return () => sub.remove();
  }, []);

  // Manage discovery based on screen
  useEffect(() => {
    if (state.screen.type === 'Connection') {
      if (state.selectedConnectionTransport === ConnectionTransport.Wifi) {
        startWifiDiscovery();
      } else {
        loadBondedBluetoothDevices();
      }
    } else {
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

  // Wi-Fi event subscriptions
  useEffect(() => {
    const fSub = addWifiDeviceFoundListener((service: DiscoveredWifiService) => {
      setState((prev) => {
        const existing = prev.wifiPlayers.find((p) => p.id === service.id);
        const player: WifiPlayer = {
          id: service.id,
          name: service.name,
          address: service.address,
        };
        const updated = existing
          ? prev.wifiPlayers.map((p) => (p.id === service.id ? player : p))
          : [...prev.wifiPlayers, player];

        const nextWifiAddr =
          !wifiAddressEditedRef.current && prev.wifiAddress.length === 0
            ? service.address
            : prev.wifiAddress;

        return {
          ...prev,
          wifiPlayers: updated,
          wifiDiscoveryStatus: ContentStatus.Ready,
          wifiAddress: nextWifiAddr,
        };
      });
    });

    const lSub = addWifiDeviceLostListener((evt) => {
      setState((prev) => ({
        ...prev,
        wifiPlayers: prev.wifiPlayers.filter((p) => p.id !== evt.id),
      }));
    });

    return () => {
      fSub?.remove();
      lSub?.remove();
    };
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

    setState((prev) => ({
      ...prev,
      wifiPlayers: [],
      wifiDiscoveryStatus: ContentStatus.Loading,
    }));
    try {
      await startWifiDiscoveryModule();
      setTimeout(() => {
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

    autoReconnectTimerRef.current = setTimeout(async () => {
      autoReconnectTimerRef.current = null;
      if (!autoReconnectEnabledRef.current || apiRef.current || stateRef.current.pinDialogVisible) {
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
    }, initialDelayMs);
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
        stopPlaybackService().catch(() => {});
        setState((prev) => ({
          ...prev,
          connectionStatus: ConnectionStatus.Error,
          connectionMessage:
            'Bluetooth permission was denied. Grant Nearby devices permission to connect to this player.',
        }));
        return false;
      }
    } else if (transport === ConnectionTransport.Wifi) {
      const wifiPerms = getRequiredPermissionsForWifi();
      if (wifiPerms.length > 0) {
        const permResult = await requestMissingPermissions(wifiPerms);
        if (!permResult.granted) {
          stopPlaybackService().catch(() => {});
          setState((prev) => ({
            ...prev,
            connectionStatus: ConnectionStatus.Error,
            connectionMessage:
              'Local network permission was denied. Grant Local Network permission to connect to this player.',
          }));
          return false;
        }
      }
    }

    const attempt = ++connectionAttemptRef.current;
    pendingSeekRef.current = null;
    pendingVolumeRef.current = null;
    let api: RemoteApi;
    let playerKey: string;

    if (transport === ConnectionTransport.Wifi) {
      const address = wifiAddr ?? stateRef.current.wifiAddress;
      if (!address || !address.trim()) return false;
      let baseUrl: string;
      try {
        baseUrl = RemoteEndpoint.normalizeWifiAddress(address);
      } catch (err: any) {
        setState((prev) => ({
          ...prev,
          connectionStatus: ConnectionStatus.Error,
          connectionMessage: err?.message || 'Enter a valid player address.',
        }));
        return false;
      }
      api = new RemoteApi(createWifiTransport(baseUrl));
      playerKey = baseUrl;
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
        stopPlaybackService().catch(() => {});
        setState((prev) => ({
          ...prev,
          connectionStatus: ConnectionStatus.Error,
          connectionMessage: err?.message || 'Could not check Bluetooth pairing status. Turn Bluetooth on and try again.',
        }));
        return false;
      }
      const bondedPlayer = bondedDevices.find(
        (device) => device.id.toLowerCase() === devId.toLowerCase()
      );
      if (!bondedPlayer) {
        const selectedPlayer = stateRef.current.bluetoothPlayers.find(
          (player) => player.id.toLowerCase() === devId.toLowerCase()
        );
        stopPlaybackService().catch(() => {});
        setState((prev) => ({
          ...prev,
          connectionStatus: ConnectionStatus.Error,
          connectionMessage: selectedPlayer
            ? `Tap Pair beside ${selectedPlayer.name}, approve Android's prompt, then try again.`
            : 'Select a paired Bluetooth player first.',
        }));
        return false;
      }
      api = new RemoteApi(new SerializedHttpTransport(new BluetoothTransport(devId)));
      playerKey = `bt:${devId}`;
    }

    setState((prev) => ({
      ...prev,
      connectionStatus: ConnectionStatus.Connecting,
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

      apiRef.current = api;
      featureSetRef.current = new Set(caps.features);
      connectedPlayerKeyRef.current = playerKey;
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
        status.playMode === 3
          ? PlaybackMode.Shuffle
          : status.playMode === 2
          ? PlaybackMode.RepeatOne
          : status.playMode === 1
          ? PlaybackMode.RepeatAll
          : PlaybackMode.Sequential;

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

      setState((prev) => ({
        ...prev,
        connectionStatus: ConnectionStatus.Connected,
        connectionTransport: transport,
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
        currentTrack: track,
      }));

      refreshQueue(api);
      loadLibraryCategory(currentLibraryCategoryRef.current, api);
      startPollingLoop();
      startCatalogSync(api, attempt, caps.features);
      return true;
    } catch (err: any) {
      if (attempt !== connectionAttemptRef.current) return false;
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
          connectionMessage: err?.message || 'Could not connect to Compás player.',
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
    connectDirect(
      stateRef.current.selectedConnectionTransport,
      stateRef.current.wifiAddress,
      stateRef.current.selectedBluetoothPlayerId ?? undefined,
      explicitPin
    );
  };

  const disconnect = () => {
    connectionAttemptRef.current++;
    pendingSeekRef.current = null;
    pendingVolumeRef.current = null;
    if (pollingTimerRef.current) clearTimeout(pollingTimerRef.current);
    if (autoReconnectTimerRef.current) {
      clearTimeout(autoReconnectTimerRef.current);
      autoReconnectTimerRef.current = null;
    }
    apiRef.current = null;
    featureSetRef.current.clear();
    connectedPlayerKeyRef.current = null;
    bluetoothAudioOutputRef.current = null;
    activeCatalogRef.current = null;
    catalogCoversByAlbumRef.current.clear();
    syncedCoverUriCacheRef.current.clear();
    queueArtworkBySongRef.current.clear();
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
      connectionMessage: null,
      catalogSyncMessage: null,
      currentTrack: null,
      isPlaying: false,
      supportedFeatures: [],
      currentFavorite: false,
      queue: [],
      libraryEntries: [],
    }));
  };

  const adoptCatalog = (identity: CatalogIdentity | null) => {
    const previous = activeCatalogRef.current;
    activeCatalogRef.current = identity;
    if (previous?.libraryId !== identity?.libraryId || previous?.revision !== identity?.revision) {
      libraryListCacheRef.current.clear();
    }
  };

  // Background Catalog Sync Worker
  const startCatalogSync = async (
    api: RemoteApi,
    attempt: number,
    features: string[],
    refreshCoversManifest: boolean = false
  ) => {
    try {
      const supported = features.includes('catalog_sync_v1');
      if (!supported) {
        adoptCatalog(null);
        catalogCoversByAlbumRef.current.clear();
        syncedCoverUriCacheRef.current.clear();
        queueArtworkBySongRef.current.clear();
        setState((prev) => ({ ...prev, catalogSyncMessage: null }));
        return;
      }

      const generation = ++catalogSyncGenerationRef.current;
      syncedCoverUriCacheRef.current.clear();
      queueArtworkBySongRef.current.clear();
      lastCatalogCoverProgressAtRef.current = 0;
      setState((prev) => ({ ...prev, catalogSyncMessage: 'Checking player library' }));

      // 1. Probe
      const probe = await catalogNetwork(api, attempt, generation, false, () => api.catalog(0, 1));
      if (!probe || generation !== catalogSyncGenerationRef.current || attempt !== connectionAttemptRef.current) {
        return;
      }

      // 2. Snapshot check
      const storedIdentity = await syncedCatalogStoreRef.current.activeIdentity(probe.libraryId);
      const storedSongCount = storedIdentity
        ? await syncedCatalogStoreRef.current.activeSongCount(storedIdentity.libraryId, storedIdentity.revision)
        : 0;

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
        const covers = await syncedCatalogStoreRef.current.catalogCovers(
          storedIdentity.libraryId,
          storedIdentity.revision
        );
        catalogCoversByAlbumRef.current.clear();
        covers.forEach((c) => {
          catalogCoversByAlbumRef.current.set(c.albumKey, c);
        });

        const coverProgress = await syncedCatalogStoreRef.current.coverProgress(
          storedIdentity.libraryId,
          storedIdentity.revision
        );
        const pending = await syncedCatalogStoreRef.current.pendingCovers(
          storedIdentity.libraryId,
          storedIdentity.revision
        );

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

      // 3. Sync songs & covers
      await syncCatalogOnce(api, attempt, generation, refreshCoversManifest);
    } catch {
      setState((prev) => ({ ...prev, catalogSyncMessage: null }));
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
      setState((prev) => ({
        ...prev,
        catalogSyncMessage: BluetoothRequestPolicy.requiresBluetoothAudioPriority(
          prev.connectionTransport,
          bluetoothAudioOutputRef.current
        ) ? 'Waiting for WiFi or paused Bluetooth audio' : 'Waiting to resume library sync',
      }));
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
    setState((prev) => ({ ...prev, catalogSyncMessage: 'Syncing songs' }));
    const firstPage = await catalogNetwork(api, attempt, generation, false, () => api.catalog(0));
    if (!firstPage.libraryId || !firstPage.revision) {
      throw new Error('Player returned no catalog identity');
    }

    let identity = await syncedCatalogStoreRef.current.activeIdentity(firstPage.libraryId);
    const activeSongCount = identity
      ? await syncedCatalogStoreRef.current.activeSongCount(firstPage.libraryId, firstPage.revision)
      : 0;
    const activeIsComplete =
      identity?.revision === firstPage.revision &&
      identity.total === firstPage.total &&
      activeSongCount === firstPage.total;

    if (!activeIsComplete) {
      await syncedCatalogStoreRef.current.beginCatalogStage(firstPage.libraryId, firstPage.revision, firstPage.total);
      await syncedCatalogStoreRef.current.writeCatalogPage(firstPage);

      let offset = firstPage.nextOffset;
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
      await syncedCatalogStoreRef.current.beginCovers(
        activeIdentity.libraryId,
        activeIdentity.revision,
        firstCovers.total,
        refreshCoversManifest
      );
      await syncedCatalogStoreRef.current.writeCoverPage(firstCovers);

      let offset = firstCovers.nextOffset;
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
    catalogCoversByAlbumRef.current.clear();
    allCovers.forEach((c) => {
      catalogCoversByAlbumRef.current.set(c.albumKey, c);
    });

    // Download pending covers
    const pending = await syncedCatalogStoreRef.current.pendingCovers(
      activeIdentity.libraryId,
      activeIdentity.revision
    );
    const downloadableTotal = allCovers.filter((c) => c.available !== false).length;
    let done = downloadableTotal - pending.length;

    for (const cover of pending) {
      if (generation !== catalogSyncGenerationRef.current || attempt !== connectionAttemptRef.current) return;
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

      const existing = await syncedCoverStoreRef.current.getUri(activeIdentity.libraryId, cover.coverKey);
      if (existing) {
        await syncedCatalogStoreRef.current.markCoverState(
          activeIdentity.libraryId,
          activeIdentity.revision,
          cover.albumKey,
          SyncedCatalogStore.COVER_STORED
        );
        syncedCoverUriCacheRef.current.set(cover.albumKey, existing);
        done++;
        continue;
      }

      try {
        const art = await catalogNetwork(api, attempt, generation, true, () =>
          api.catalogArt(activeIdentity.revision, cover.representativeId, cover.coverKey)
        );
        if (art && art.base64) {
          await syncedCoverStoreRef.current.put(activeIdentity.libraryId, cover.coverKey, art.base64);
          const uri = await syncedCoverStoreRef.current.getUri(activeIdentity.libraryId, cover.coverKey, art.contentType || 'image/jpeg');
          await syncedCatalogStoreRef.current.markCoverState(
            activeIdentity.libraryId,
            activeIdentity.revision,
            cover.albumKey,
            uri ? SyncedCatalogStore.COVER_STORED : SyncedCatalogStore.COVER_MISSING
          );
          if (uri) syncedCoverUriCacheRef.current.set(cover.albumKey, uri);
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
        }
      }
      done++;
    }

    setState((prev) => ({ ...prev, catalogSyncMessage: null }));
  };

  // Status Polling Loop
  const startPollingLoop = () => {
    if (pollingTimerRef.current) clearTimeout(pollingTimerRef.current);

    const poll = async () => {
      const api = apiRef.current;
      if (!api || stateRef.current.connectionStatus !== ConnectionStatus.Connected) return;

      const transport = stateRef.current.connectionTransport;
      if (!BluetoothRequestPolicy.allowsPassiveRequests(
        transport,
        appForegroundRef.current,
        bluetoothAudioOutputRef.current
      )) {
        pollingTimerRef.current = setTimeout(poll, 1000);
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
          status.playMode === 3
            ? PlaybackMode.Shuffle
            : status.playMode === 2
            ? PlaybackMode.RepeatOne
            : status.playMode === 1
            ? PlaybackMode.RepeatAll
            : PlaybackMode.Sequential;

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

        const nextInterval = BluetoothRequestPolicy.statusPollInterval(
          transport,
          1500,
          status.bluetoothAudioOutput
        );
        const queueInterval = BluetoothRequestPolicy.queuePollInterval(
          transport,
          stateRef.current.screen,
          5000,
          status.bluetoothAudioOutput
        );
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
        pollingTimerRef.current = setTimeout(poll, nextInterval);
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
          pollingTimerRef.current = setTimeout(poll, 3000);
        }
      }
    };

    pollingTimerRef.current = setTimeout(poll, 300);
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
    if (!api) return;

    setState((prev) => ({ ...prev, queueStatus: ContentStatus.Loading }));
    try {
      const qPage = await api.queue(0, 25);
      queueRevisionRef.current = qPage.revision;
      queueTargetsRef.current.clear();

      const tracks = qPage.songs.map((song, idx) => queueTrackFrom(song, idx, qPage.revision));

      setState((prev) => ({
        ...prev,
        queue: tracks,
        queueTotal: qPage.total,
        queueHasMore: tracks.length < qPage.total,
        queueStatus: tracks.length > 0 ? ContentStatus.Ready : ContentStatus.Empty,
      }));
      void loadQueueArtwork(qPage.songs.map((song) => song.index), api);
    } catch {
      setState((prev) => ({ ...prev, queueStatus: ContentStatus.Error }));
    }
  };

  const refreshQueueIfChanged = async (api: RemoteApi) => {
    const page = await api.queue(0, 25);
    lastQueueRefreshAtRef.current = Date.now();
    if (page.revision !== queueRevisionRef.current || page.total !== stateRef.current.queueTotal) {
      await refreshQueue(api);
    }
  };

  const tryUpgradeToWifi = async (currentApi: RemoteApi): Promise<boolean> => {
    lastWifiProbeAtRef.current = Date.now();
    if (!BluetoothRequestPolicy.allowsPassiveRequests(
      ConnectionTransport.Bluetooth,
      appForegroundRef.current,
      bluetoothAudioOutputRef.current
    )) return false;
    const savedAddress = await AsyncStorage.getItem(PREF_WIFI_ADDRESS);
    if (!savedAddress?.trim()) return false;
    const wifiPerms = getRequiredPermissionsForWifi();
    if (wifiPerms.length > 0 && !(await checkPermissions(wifiPerms))) return false;

    let endpoint: string;
    try {
      endpoint = RemoteEndpoint.normalizeWifiAddress(savedAddress);
    } catch {
      return false;
    }
    const playerKey = endpoint;
    const candidate = new RemoteApi(createWifiTransport(endpoint, 5000));
    const savedPin = await pinStoreRef.current.get(playerKey);
    if (savedPin) candidate.setPin(savedPin);

    try {
      const caps = await candidate.capabilities();
      if (caps.version !== 1 || apiRef.current !== currentApi) return false;
      const status = await candidate.status();
      if (apiRef.current !== currentApi) return false;

      currentApi.preemptArtworkRequest();
      apiRef.current = candidate;
      pendingSeekRef.current = null;
      pendingVolumeRef.current = null;
      connectedPlayerKeyRef.current = playerKey;
      bluetoothAudioOutputRef.current = null;
      lastQueueRefreshAtRef.current = Date.now();
      gateRef.current.reset();
      AsyncStorage.setItem(PREF_LAST_TRANSPORT, 'wifi').catch(() => {});
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
        playbackMode: status.playMode === 3
          ? PlaybackMode.Shuffle
          : status.playMode === 2
            ? PlaybackMode.RepeatOne
            : status.playMode === 1
              ? PlaybackMode.RepeatAll
              : PlaybackMode.Sequential,
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
      return true;
    } catch {
      return false;
    }
  };

  const loadMoreQueue = async () => {
    const api = apiRef.current;
    if (!api || stateRef.current.queueLoadingMore || !stateRef.current.queueHasMore) return;

    setState((prev) => ({ ...prev, queueLoadingMore: true }));
    try {
      const currentLen = stateRef.current.queue.length;
      const qPage = await api.queue(currentLen, 25);

      if (qPage.revision !== queueRevisionRef.current) {
        setState((prev) => ({
          ...prev,
          queueLoadingMore: false,
          connectionMessage: 'The queue changed. It is being refreshed.',
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
      setState((prev) => ({ ...prev, queueLoadingMore: false }));
    }
  };

  const removeQueueTrack = async (id: string) => {
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
      }
    }
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
    const context: LibraryContext = { kind, name: group.name };
    libraryContextRef.current = context;

    try {
      let albums: LibraryGroup[] = [];
      if (catalog) {
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

      const entries = libraryEntriesRef.current.albums(albums, context);
      setState((prev) => ({
        ...prev,
        libraryEntries: entries,
        libraryCountLabel: `${entries.length} albums · ${group.count} tracks`,
        libraryStatus: entries.length > 0 ? ContentStatus.Ready : ContentStatus.Empty,
      }));
    } catch (err: any) {
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

    await startSongPage(filter, playContext, album.albumKey ?? null, false);
  };

  const browsePlaylist = async (playlist: Playlist) => {
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
      setState((prev) => ({
        ...prev,
        libraryStatus: ContentStatus.Error,
        libraryCountLabel: err?.message || 'Failed to load playlist tracks',
      }));
    }
  };

  const browseFolder = async (root: string, path: string, name: string) => {
    const api = apiRef.current;
    if (!api) return;
    setState((prev) => ({
      ...prev, libraryNestedTitle: name, libraryEntries: [],
      libraryStatus: ContentStatus.Loading, libraryCountLabel: null,
      libraryHasMore: false, folderPath: path, folderRoot: root,
    }));
    try {
      const page = await api.folder(path, 0, root);
      const entries = libraryEntriesRef.current.folderItems(page.entries, root, path);
      extensionPageRef.current = { kind: 'folder', root, path, nextOffset: page.nextOffset, total: page.total };
      setState((prev) => ({
        ...prev, libraryEntries: entries,
        libraryStatus: entries.length ? ContentStatus.Ready : ContentStatus.Empty,
        libraryCountLabel: `${page.total} items`, libraryHasMore: page.nextOffset < page.total,
      }));
    } catch (err: any) {
      setState((prev) => ({ ...prev, libraryStatus: ContentStatus.Error, connectionMessage: err?.message || 'Could not open folder' }));
    }
  };

  const startSongPage = async (
    filter: LibraryFilter,
    playContext: PlayContext,
    albumKey: string | null = null,
    append: boolean = false
  ) => {
    if (append && libraryPageLoadingRef.current) return;
    if (!append) libraryPageRef.current = { filter, playContext, albumKey };
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
          albumKey
        );
        songs = res.songs.map(songFromCatalog);
        total = res.total;
      } else if (api) {
        const res = await api.library(currentOffset, pageSize, null, filter);
        songs = res.songs;
        total = res.total;
      }

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
      setState((prev) => ({
        ...prev,
        libraryStatus: ContentStatus.Error,
        libraryCountLabel: err?.message || 'Failed to load tracks',
      }));
    } finally {
      libraryPageLoadingRef.current = false;
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
      if (attempt === connectionAttemptRef.current && api === apiRef.current) {
        gateRef.current.finishAction(token, CommandOutcome.Succeeded, Date.now());
      }
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

  const clearQueue = async () => {
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
      if (selection.canceled) return;
      const asset = selection.assets[0];
      if (!asset || !/\.m3u8?$/i.test(asset.name)) throw new Error('Choose an M3U or M3U8 playlist file');
      if (asset.size != null && asset.size > 256 * 1024) throw new Error('Playlist file must be 256 KiB or smaller');
      const body = await new File(asset.uri).bytes();
      const result = await api.importPlaylist(name.trim(), body);
      if (api !== apiRef.current) return;
      await loadLibraryCategory(LibraryCategory.Playlists, api);
      Alert.alert('Playlist imported', `${result.matched} of ${result.entries} entries matched songs on this player.`);
    } catch (err: any) {
      setState((prev) => ({ ...prev, connectionMessage: err?.message || 'Could not import playlist' }));
    }
  };

  const loadLibraryArtwork = async (entryId: string) => {
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

    const uri = await resolveArtworkUri({ albumKey, songIndex }, artworkSources(apiRef.current));
    if (uri) libraryArtwork.queue(entryId, uri);
  };

  const artworkSources = (network: RemoteApi | null): ArtworkSources => ({
    catalog: activeCatalogRef.current,
    coverUrisByAlbum: syncedCoverUriCacheRef.current,
    coversByAlbum: catalogCoversByAlbumRef.current,
    coverStore: syncedCoverStoreRef.current,
    artCache: artCacheRef.current,
    network,
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
    for (const songIndex of new Set(songIndexes)) {
      if (songIndex < 0 || queueArtworkBySongRef.current.has(songIndex)) continue;
      if (apiRef.current !== api) return;
      const albumKey = catalog
        ? await syncedCatalogStoreRef.current.albumKeyForSong(catalog.libraryId, catalog.revision, songIndex).catch(() => null)
        : null;
      const uri = await resolveArtworkUri(
        { albumKey, songIndex },
        artworkSources(allowsQueueArtworkRequests() ? api : null),
      );
      if (!uri) continue;
      queueArtworkBySongRef.current.set(songIndex, uri);
      setState((prev) => ({
        ...prev,
        queue: prev.queue.map((track) =>
          queueTargetsRef.current.get(track.id)?.songIndex === songIndex ? { ...track, artwork: uri } : track,
        ),
      }));
    }
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
        pairBtDevice(action.id).catch(() => {});
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
        api.previous().catch(() => {});
        break;
      }

      case 'Next': {
        const api = apiRef.current;
        if (!api) return;
        api.next().catch(() => {});
        break;
      }

      case 'ToggleShuffle': {
        const api = apiRef.current;
        if (!api) return;
        const current = stateRef.current.playbackMode;
        if (current !== PlaybackMode.Shuffle) {
          lastNonShuffleModeRef.current = current;
        }
        const target =
          current === PlaybackMode.Shuffle ? lastNonShuffleModeRef.current : PlaybackMode.Shuffle;
        setState((prev) => ({ ...prev, playbackMode: target }));
        api.setPlayMode(target === PlaybackMode.Shuffle ? 3 : 0).catch(() => {});
        break;
      }

      case 'CycleRepeatMode': {
        const api = apiRef.current;
        if (!api) return;
        const current = stateRef.current.playbackMode;
        let target: PlaybackMode;
        if (current === PlaybackMode.Shuffle || current === PlaybackMode.Sequential) {
          target = PlaybackMode.RepeatAll;
        } else if (current === PlaybackMode.RepeatAll) {
          target = PlaybackMode.RepeatOne;
        } else {
          target = PlaybackMode.Sequential;
        }
        lastNonShuffleModeRef.current = target;
        const modeNum = target === PlaybackMode.RepeatOne ? 2 : target === PlaybackMode.RepeatAll ? 1 : 0;
        setState((prev) => ({ ...prev, playbackMode: target }));
        api.setPlayMode(modeNum).catch(() => {});
        break;
      }

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
          startSongPage(page.filter, page.playContext, page.albumKey, true);
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
    }
  }, []);

  return {
    state,
    onAction,
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
