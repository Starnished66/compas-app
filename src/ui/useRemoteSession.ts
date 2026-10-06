/**
 * State machine and view model hook for Compás Remote.
 * Binds the UI to RemoteApi, PlaybackStatusGate, SyncedCatalogStore,
 * SyncedCoverStore, CatalogSyncWorker, and native platform services.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ConnectionStatus,
  ConnectionTransport,
  ContentStatus,
  LibraryCategory,
  PlaybackMode,
  PlaybackStatus,
} from '../core/models';
import { RemoteApi } from '../core/api';
import { WifiHttpTransport } from '../core/transport';
import { BluetoothRfcommTransport, BluetoothPeer } from '../native/bluetooth';
import { PlaybackStatusGate, CommandOutcome } from '../core/playbackStatusGate';
import { BluetoothRequestPolicy } from '../core/policies';
import { SecurePinStore } from '../storage/securePinStore';
import { SyncedCatalogStore } from '../storage/syncedCatalogStore';
import { SyncedCoverStore } from '../storage/syncedCoverStore';
import { CatalogSyncWorker } from '../storage/catalogSyncWorker';
import { NativeMediaSession } from '../native/mediaSession';
import { NativeDiscovery, DiscoveredPlayer } from '../native/discovery';
import { normalizeWifiAddress } from '../core/endpoint';
import { RemoteApiException } from '../core/errors';

export interface RemoteTrackUi {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: string;
  artworkUri?: string | null;
  codec?: string | null;
  sourceBitDepth?: number | null;
  sourceSampleRateHz?: number | null;
}

export interface LibraryEntryUi {
  id: string;
  title: string;
  subtitle: string;
  artworkUri?: string | null;
}

export interface WifiPlayerUi {
  id: string;
  name: string;
  address: string;
}

export interface BluetoothPlayerUi {
  id: string;
  name: string;
  paired: boolean;
  bonding?: boolean;
}

export interface NavigationState {
  screen: 'home' | 'library' | 'queue' | 'connection';
  category: LibraryCategory;
  nestedArtist?: string | null;
  nestedAlbum?: string | null;
  nestedPlaylistKey?: string | null;
  nestedGenre?: string | null;
  nestedTitle?: string | null;
}

const STORAGE_KEY_WIFI_ADDRESS = 'compas_saved_wifi_address';
const STORAGE_KEY_THEME = 'compas_theme';
const STORAGE_KEY_TRANSPORT = 'compas_saved_transport';
const STORAGE_KEY_BT_ADDRESS = 'compas_saved_bt_address';

export function useRemoteSession() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [navStack, setNavStack] = useState<NavigationState[]>([
    { screen: 'home', category: LibraryCategory.Albums },
  ]);

  const currentNav = navStack[navStack.length - 1]!;

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [connectionTransport, setConnectionTransport] = useState<ConnectionTransport>('wifi');
  const [selectedTransport, setSelectedTransport] = useState<ConnectionTransport>('wifi');

  const [wifiAddress, setWifiAddress] = useState<string>('');
  const [wifiPlayers, setWifiPlayers] = useState<WifiPlayerUi[]>([]);
  const [wifiDiscoveryStatus, setWifiDiscoveryStatus] = useState<ContentStatus>('ready');

  const [bluetoothPlayers, setBluetoothPlayers] = useState<BluetoothPlayerUi[]>([]);
  const [selectedBluetoothAddress, setSelectedBluetoothAddress] = useState<string | null>(null);
  const [bluetoothScanStatus, setBluetoothScanStatus] = useState<ContentStatus>('ready');

  const [playerName, setPlayerName] = useState<string>('Compás Player');
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);

  // PIN dialog
  const [pinDialogVisible, setPinDialogVisible] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinRetryDelaySeconds, setPinRetryDelaySeconds] = useState(0);

  // Playback state
  const [currentTrack, setCurrentTrack] = useState<RemoteTrackUi | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [volume, setVolumeState] = useState(0.68);
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>(PlaybackMode.RepeatAll);
  const [bluetoothAudioOutput, setBluetoothAudioOutput] = useState<boolean | null>(null);

  // Queue state
  const [queue, setQueue] = useState<RemoteTrackUi[]>([]);
  const [queueStatus, setQueueStatus] = useState<ContentStatus>('ready');
  const [queueHasMore, setQueueHasMore] = useState(false);
  const [queueLoadingMore, setQueueLoadingMore] = useState(false);
  const [queueRevision, setQueueRevision] = useState(0);

  // Library state
  const [libraryEntries, setLibraryEntries] = useState<LibraryEntryUi[]>([]);
  const [libraryStatus, setLibraryStatus] = useState<ContentStatus>('ready');
  const [libraryQuery, setLibraryQuery] = useState('');
  const [libraryCountLabel, setLibraryCountLabel] = useState<string | null>(null);
  const [libraryHasMore, setLibraryHasMore] = useState(false);
  const [catalogSyncMessage, setCatalogSyncMessage] = useState<string | null>(null);

  // Singletons
  const pinStoreRef = useRef(new SecurePinStore());
  const catalogStoreRef = useRef(new SyncedCatalogStore());
  const coverStoreRef = useRef(new SyncedCoverStore());
  const syncWorkerRef = useRef(new CatalogSyncWorker());
  const statusGateRef = useRef(new PlaybackStatusGate());
  const apiRef = useRef<RemoteApi | null>(null);

  const activeLibraryIdRef = useRef<string | null>(null);
  const activeCatalogRevisionRef = useRef<string | null>(null);
  const isAppForegroundRef = useRef(true);

  // Load preferences
  useEffect(() => {
    (async () => {
      try {
        const savedAddress = await AsyncStorage.getItem(STORAGE_KEY_WIFI_ADDRESS);
        if (savedAddress) setWifiAddress(savedAddress);

        const savedTheme = await AsyncStorage.getItem(STORAGE_KEY_THEME);
        if (savedTheme === 'light' || savedTheme === 'dark') setTheme(savedTheme);

        const savedTransport = await AsyncStorage.getItem(STORAGE_KEY_TRANSPORT);
        if (savedTransport === 'bluetooth' || savedTransport === 'wifi') {
          setSelectedTransport(savedTransport);
        }

        const savedBt = await AsyncStorage.getItem(STORAGE_KEY_BT_ADDRESS);
        if (savedBt) setSelectedBluetoothAddress(savedBt);
      } catch {}
    })();
  }, []);

  // Listen to AppState
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      isAppForegroundRef.current = nextState === 'active';
    });
    return () => sub.remove();
  }, []);

  // Initialize MediaSession action listener
  useEffect(() => {
    const unbind = NativeMediaSession.init((event) => {
      switch (event.action) {
        case 'play':
        case 'pause':
          togglePlayback();
          break;
        case 'next':
          nextTrack();
          break;
        case 'previous':
          previousTrack();
          break;
        case 'seek':
          if (event.value !== undefined) seekTo(event.value);
          break;
        case 'volume':
          if (event.value !== undefined) setVolume(event.value);
          break;
      }
    });
    return () => unbind();
  }, []);

  // Helper: Format milliseconds into m:ss
  const formatTime = (ms: number): string => {
    const seconds = Math.floor(Math.max(ms, 0) / 1000);
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Build API Client
  const createApiClient = useCallback(
    async (transportType: ConnectionTransport, addressOrMac: string): Promise<RemoteApi> => {
      let transport: any;
      const playerId = addressOrMac;

      if (transportType === 'wifi') {
        const normalized = normalizeWifiAddress(addressOrMac);
        transport = new WifiHttpTransport(normalized);
      } else {
        transport = new BluetoothRfcommTransport(addressOrMac);
      }

      const savedPin = await pinStoreRef.current.get(playerId);
      return new RemoteApi(transport, savedPin);
    },
    []
  );

  // Connect action
  const connect = useCallback(async () => {
    setConnectionStatus('connecting');
    setConnectionMessage(null);
    statusGateRef.current.reset();

    const targetTransport = selectedTransport;
    const targetAddress =
      targetTransport === 'wifi' ? wifiAddress : selectedBluetoothAddress;

    if (!targetAddress) {
      setConnectionStatus('error');
      setConnectionMessage(
        targetTransport === 'wifi'
          ? 'Enter a player address'
          : 'Select a Bluetooth player'
      );
      return;
    }

    try {
      const client = await createApiClient(targetTransport, targetAddress);
      apiRef.current = client;

      // Capability handshake
      const caps = await client.capabilities();
      setPlayerName('Compás Player');

      // Attempt status read
      let status: PlaybackStatus;
      try {
        status = await client.status();
      } catch (err: any) {
        if (err instanceof RemoteApiException && err.pinRequired) {
          setPinError(null);
          setPinDialogVisible(true);
          setConnectionStatus('connecting');
          return;
        }
        throw err;
      }

      // Successful connection!
      setConnectionStatus('connected');
      setConnectionTransport(targetTransport);
      setConnectionMessage(null);

      // Save connection address
      if (targetTransport === 'wifi') {
        await AsyncStorage.setItem(STORAGE_KEY_WIFI_ADDRESS, targetAddress);
      } else {
        await AsyncStorage.setItem(STORAGE_KEY_BT_ADDRESS, targetAddress);
      }
      await AsyncStorage.setItem(STORAGE_KEY_TRANSPORT, targetTransport);

      applyStatus(status, client);
      refreshQueue(client);

      // Check if catalog sync is supported
      if (caps.features.includes(RemoteApi.CATALOG_SYNC_FEATURE)) {
        startCatalogSync(client, targetTransport, status.playing, status.bluetoothAudioOutput);
      }
    } catch (err: any) {
      setConnectionStatus('error');
      if (err instanceof RemoteApiException) {
        if (err.pinRequired) {
          setPinError(null);
          setPinDialogVisible(true);
          return;
        }
        if (err.pinRateLimited) {
          setConnectionMessage(`PIN attempts paused. Try again in ${err.retryAfterSeconds}s.`);
          setPinRetryDelaySeconds(err.retryAfterSeconds);
          return;
        }
        setConnectionMessage(`Connection failed (${err.statusCode}): ${err.message}`);
      } else {
        setConnectionMessage(err.message || 'Could not connect to player');
      }
    }
  }, [selectedTransport, wifiAddress, selectedBluetoothAddress, createApiClient]);

  // Apply playback status
  const applyStatus = useCallback((status: PlaybackStatus, api: RemoteApi) => {
    const snap = statusGateRef.current.snapshot();
    const confirmed = statusGateRef.current.confirmStatus(snap, status.playing, Date.now());

    if (confirmed) {
      setIsPlaying(status.playing);
    }
    setPositionMs(status.positionSeconds * 1000);
    setDurationMs(status.durationSeconds * 1000);
    setVolumeState(status.volume);
    setPlaybackMode(status.playMode);
    setBluetoothAudioOutput(status.bluetoothAudioOutput ?? null);

    if (status.title || status.artist || status.album) {
      // Resolve artwork URI
      let artUri: string | null = null;
      if (activeLibraryIdRef.current && status.title) {
        // Check catalog covers
      }
      if (!artUri && api.transport instanceof WifiHttpTransport) {
        artUri = `${api.transport.baseUrl}/api/v1/art`;
      }

      const trackUi: RemoteTrackUi = {
        id: 'current',
        title: status.title || 'Unknown Title',
        artist: status.artist || 'Unknown Artist',
        album: status.album || '',
        duration: formatTime(status.durationSeconds * 1000),
        artworkUri: artUri,
        codec: status.codec || null,
        sourceBitDepth: status.sourceBitDepth || null,
        sourceSampleRateHz: status.sourceSampleRateHz || null,
      };

      setCurrentTrack(trackUi);

      NativeMediaSession.update({
        title: trackUi.title,
        artist: trackUi.artist,
        album: trackUi.album,
        isPlaying: status.playing,
        positionMs: status.positionSeconds * 1000,
        durationMs: status.durationSeconds * 1000,
        volume: status.volume,
        artworkPath: artUri,
      });
    } else {
      setCurrentTrack(null);
      NativeMediaSession.clear();
    }
  }, []);

  // Poll status loop
  useEffect(() => {
    if (connectionStatus !== 'connected') return;

    let active = true;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      const api = apiRef.current;
      if (!api || !active) return;

      const allowsPassive = BluetoothRequestPolicy.allowsPassiveRequests(
        connectionTransport,
        isAppForegroundRef.current,
        bluetoothAudioOutput
      );

      if (allowsPassive) {
        try {
          const status = await api.status();
          if (active) applyStatus(status, api);
        } catch (err: any) {
          if (err instanceof RemoteApiException && err.pinRequired) {
            setPinDialogVisible(true);
          }
        }
      }

      if (!active) return;
      const interval = BluetoothRequestPolicy.statusPollInterval(
        connectionTransport,
        1000,
        bluetoothAudioOutput
      );
      timer = setTimeout(poll, interval);
    };

    const initialInterval = BluetoothRequestPolicy.statusPollInterval(
      connectionTransport,
      1000,
      bluetoothAudioOutput
    );
    timer = setTimeout(poll, initialInterval);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [connectionStatus, connectionTransport, bluetoothAudioOutput, applyStatus]);

  // Queue fetching
  const refreshQueue = useCallback(async (client?: RemoteApi) => {
    const api = client || apiRef.current;
    if (!api) return;

    setQueueStatus('loading');
    try {
      const page = await api.queue(0, 25);
      setQueueRevision(page.revision);
      const uiQueue: RemoteTrackUi[] = page.songs.map((s, idx) => ({
        id: String(s.index),
        title: s.title || `Track ${idx + 1}`,
        artist: s.artist || '',
        album: s.album || '',
        duration: '',
        artworkUri: null,
      }));
      setQueue(uiQueue);
      setQueueHasMore(page.total > uiQueue.length);
      setQueueStatus(uiQueue.length === 0 ? 'empty' : 'ready');
    } catch {
      setQueueStatus('error');
    }
  }, []);

  // Background catalog sync
  const startCatalogSync = useCallback(
    async (
      api: RemoteApi,
      transport: ConnectionTransport,
      playing: boolean,
      btAudioOutput?: boolean | null
    ) => {
      try {
        await syncWorkerRef.current.runSync(
          api,
          catalogStoreRef.current,
          coverStoreRef.current,
          {
            transport,
            isPlaying: playing,
            bluetoothAudioOutput: btAudioOutput,
            onProgress: (p) => {
              if (p.stage === 'complete') {
                setCatalogSyncMessage(null);
              } else {
                setCatalogSyncMessage(p.message);
              }
            },
          }
        );
      } catch {}
    },
    []
  );

  // Playback control actions
  const togglePlayback = useCallback(async () => {
    const api = apiRef.current;
    if (!api) return;

    const actionId = statusGateRef.current.beginAction();
    setIsPlaying((prev) => !prev); // Optimistic UI update

    try {
      await api.togglePlayback();
      statusGateRef.current.finishAction(actionId, CommandOutcome.Succeeded, Date.now());
    } catch {
      statusGateRef.current.finishAction(actionId, CommandOutcome.Failed, Date.now());
    }
  }, []);

  const nextTrack = useCallback(async () => {
    const api = apiRef.current;
    if (!api) return;
    try {
      await api.next();
      const status = await api.status();
      applyStatus(status, api);
    } catch {}
  }, [applyStatus]);

  const previousTrack = useCallback(async () => {
    const api = apiRef.current;
    if (!api) return;
    try {
      await api.previous();
      const status = await api.status();
      applyStatus(status, api);
    } catch {}
  }, [applyStatus]);

  const seekTo = useCallback(
    async (ms: number) => {
      const api = apiRef.current;
      if (!api) return;
      setPositionMs(ms);
      try {
        await api.seek(Math.floor(ms / 1000));
      } catch {}
    },
    []
  );

  const setVolume = useCallback(
    async (vol: number) => {
      const api = apiRef.current;
      if (!api) return;
      setVolumeState(vol);
      try {
        await api.setVolume(Math.round(vol * 100));
      } catch {}
    },
    []
  );

  const cycleRepeatMode = useCallback(async () => {
    const api = apiRef.current;
    if (!api) return;
    try {
      await api.cyclePlayMode();
      const status = await api.status();
      applyStatus(status, api);
    } catch {}
  }, [applyStatus]);

  const toggleShuffle = useCallback(async () => {
    const api = apiRef.current;
    if (!api) return;
    try {
      const target = playbackMode === PlaybackMode.Shuffle ? PlaybackMode.RepeatAll : PlaybackMode.Shuffle;
      await api.setPlayMode(target);
      const status = await api.status();
      applyStatus(status, api);
    } catch {}
  }, [playbackMode, applyStatus]);

  // Library loading
  const loadLibrary = useCallback(async () => {
    const api = apiRef.current;
    if (!api || connectionStatus !== 'connected') return;

    setLibraryStatus('loading');

    try {
      const nav = currentNav;
      if (nav.nestedAlbum) {
        // Load songs for nested album
        const songs = await api.library(0, 100, libraryQuery || undefined, {
          album: nav.nestedAlbum,
          artist: nav.nestedArtist || undefined,
        });
        const entries: LibraryEntryUi[] = songs.songs.map((s) => ({
          id: String(s.index),
          title: s.title,
          subtitle: [s.artist, s.album].filter(Boolean).join(' · '),
        }));
        setLibraryEntries(entries);
        setLibraryCountLabel(`${entries.length} tracks`);
        setLibraryStatus(entries.length === 0 ? 'empty' : 'ready');
      } else if (nav.nestedArtist) {
        // Load albums for nested artist
        const albums = await api.albums({ artist: nav.nestedArtist });
        const entries: LibraryEntryUi[] = albums.map((a) => ({
          id: a.name,
          title: a.name,
          subtitle: `${a.count} tracks`,
        }));
        setLibraryEntries(entries);
        setLibraryCountLabel(`${entries.length} albums`);
        setLibraryStatus(entries.length === 0 ? 'empty' : 'ready');
      } else {
        // Top-level categories
        switch (nav.category) {
          case LibraryCategory.Artists: {
            const list = await api.artists();
            const entries = list.map((g) => ({
              id: g.name,
              title: g.name,
              subtitle: `${g.count} tracks`,
            }));
            setLibraryEntries(entries);
            setLibraryCountLabel(`${entries.length} artists`);
            setLibraryStatus(entries.length === 0 ? 'empty' : 'ready');
            break;
          }
          case LibraryCategory.AlbumArtists: {
            const list = await api.albumArtists();
            const entries = list.map((g) => ({
              id: g.name,
              title: g.name,
              subtitle: `${g.count} tracks`,
            }));
            setLibraryEntries(entries);
            setLibraryCountLabel(`${entries.length} album artists`);
            setLibraryStatus(entries.length === 0 ? 'empty' : 'ready');
            break;
          }
          case LibraryCategory.Albums: {
            const list = await api.albums();
            const entries = list.map((g) => ({
              id: g.name,
              title: g.name,
              subtitle: `${g.count} tracks`,
            }));
            setLibraryEntries(entries);
            setLibraryCountLabel(`${entries.length} albums`);
            setLibraryStatus(entries.length === 0 ? 'empty' : 'ready');
            break;
          }
          case LibraryCategory.Playlists: {
            const list = await api.playlists();
            const entries = list.map((p) => ({
              id: p.key,
              title: p.name,
              subtitle: p.internal ? 'Smart Playlist' : 'Playlist',
            }));
            setLibraryEntries(entries);
            setLibraryCountLabel(`${entries.length} playlists`);
            setLibraryStatus(entries.length === 0 ? 'empty' : 'ready');
            break;
          }
          case LibraryCategory.Genres: {
            const list = await api.genres();
            const entries = list.map((g) => ({
              id: g.name,
              title: g.name,
              subtitle: `${g.count} tracks`,
            }));
            setLibraryEntries(entries);
            setLibraryCountLabel(`${entries.length} genres`);
            setLibraryStatus(entries.length === 0 ? 'empty' : 'ready');
            break;
          }
          case LibraryCategory.Songs: {
            const page = await api.library(0, 100, libraryQuery || undefined);
            const entries = page.songs.map((s) => ({
              id: String(s.index),
              title: s.title,
              subtitle: [s.artist, s.album].filter(Boolean).join(' · '),
            }));
            setLibraryEntries(entries);
            setLibraryCountLabel(`${page.total} tracks`);
            setLibraryStatus(entries.length === 0 ? 'empty' : 'ready');
            break;
          }
        }
      }
    } catch {
      setLibraryStatus('error');
    }
  }, [connectionStatus, currentNav, libraryQuery]);

  // Reload library when category or nav changes
  useEffect(() => {
    if (currentNav.screen === 'library') {
      loadLibrary();
    }
  }, [currentNav, loadLibrary]);

  // Select Library entry (drilldown / play)
  const selectLibraryEntry = useCallback(
    async (id: string) => {
      const api = apiRef.current;
      if (!api) return;

      const nav = currentNav;
      if (nav.nestedAlbum) {
        // Clicking a track -> play song!
        const songId = Number(id);
        if (songId >= 0) {
          try {
            await api.play(
              songId,
              { artist: nav.nestedArtist || undefined, album: nav.nestedAlbum },
              activeCatalogRevisionRef.current || undefined
            );
            const status = await api.status();
            applyStatus(status, api);
            refreshQueue(api);
            // Navigate to Home
            setNavStack([{ screen: 'home', category: nav.category }]);
          } catch {}
        }
      } else if (nav.nestedArtist) {
        // Selected album under artist -> drill into album
        setNavStack((prev) => [
          ...prev,
          {
            screen: 'library',
            category: nav.category,
            nestedArtist: nav.nestedArtist,
            nestedAlbum: id,
            nestedTitle: id,
          },
        ]);
      } else {
        // Top level drilldowns
        switch (nav.category) {
          case LibraryCategory.Artists:
            setNavStack((prev) => [
              ...prev,
              {
                screen: 'library',
                category: nav.category,
                nestedArtist: id,
                nestedTitle: id,
              },
            ]);
            break;
          case LibraryCategory.Albums:
            setNavStack((prev) => [
              ...prev,
              {
                screen: 'library',
                category: nav.category,
                nestedAlbum: id,
                nestedTitle: id,
              },
            ]);
            break;
          case LibraryCategory.Playlists:
            // Drill into playlist songs
            setNavStack((prev) => [
              ...prev,
              {
                screen: 'library',
                category: nav.category,
                nestedPlaylistKey: id,
                nestedTitle: id,
              },
            ]);
            break;
          case LibraryCategory.Songs:
            // Play song immediately
            try {
              await api.play(Number(id));
              const status = await api.status();
              applyStatus(status, api);
              refreshQueue(api);
              setNavStack([{ screen: 'home', category: nav.category }]);
            } catch {}
            break;
        }
      }
    },
    [currentNav, applyStatus, refreshQueue]
  );

  // Navigation actions
  const navigateTo = (screen: 'home' | 'library' | 'queue' | 'connection') => {
    setNavStack((prev) => [...prev, { screen, category: prev[prev.length - 1]!.category }]);
  };

  const navigateLibraryCategory = (category: LibraryCategory) => {
    setNavStack([
      {
        screen: 'library',
        category,
      },
    ]);
  };

  const goBack = () => {
    if (navStack.length > 1) {
      setNavStack((prev) => prev.slice(0, -1));
    }
  };

  // PIN submission
  const submitPin = async () => {
    if (pinInput.length < 4 || pinInput.length > 12) {
      setPinError('PIN must be 4 to 12 digits');
      return;
    }

    const targetAddress =
      selectedTransport === 'wifi' ? wifiAddress : selectedBluetoothAddress;
    if (targetAddress) {
      await pinStoreRef.current.put(targetAddress, pinInput);
    }

    setPinDialogVisible(false);
    setPinError(null);
    connect();
  };

  // Wi-Fi Discovery
  useEffect(() => {
    if (selectedTransport !== 'wifi') return;
    setWifiDiscoveryStatus('loading');
    const stop = NativeDiscovery.start(
      (player: DiscoveredPlayer) => {
        setWifiPlayers((prev) => {
          if (prev.some((p) => p.id === player.id)) return prev;
          return [...prev, { id: player.id, name: player.name, address: player.address }];
        });
        setWifiDiscoveryStatus('ready');
      },
      (lostId: string) => {
        setWifiPlayers((prev) => prev.filter((p) => p.id !== lostId));
      }
    );
    return () => stop();
  }, [selectedTransport]);

  // Bluetooth scanning
  const scanBluetooth = () => {
    setBluetoothScanStatus('loading');
    BluetoothRfcommTransport.getBondedDevices().then((bonded) => {
      setBluetoothPlayers(
        bonded.map((b) => ({ id: b.address, name: b.name, paired: b.paired }))
      );
    });

    BluetoothRfcommTransport.startScan(
      (peer: BluetoothPeer) => {
        setBluetoothPlayers((prev) => {
          if (prev.some((p) => p.id === peer.address)) return prev;
          return [...prev, { id: peer.address, name: peer.name, paired: peer.paired }];
        });
      },
      () => {
        setBluetoothScanStatus('ready');
      }
    );
  };

  // Initial Bluetooth scan if Bluetooth transport is selected
  useEffect(() => {
    if (selectedTransport === 'bluetooth') {
      scanBluetooth();
    }
  }, [selectedTransport]);

  const toggleTheme = async () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    await AsyncStorage.setItem(STORAGE_KEY_THEME, next);
  };

  return {
    screen: currentNav.screen,
    libraryCategory: currentNav.category,
    libraryIsNested: Boolean(currentNav.nestedArtist || currentNav.nestedAlbum || currentNav.nestedPlaylistKey),
    libraryNestedTitle: currentNav.nestedTitle || null,
    theme,
    toggleTheme,
    navigateTo,
    navigateLibraryCategory,
    goBack,
    connectionStatus,
    connectionTransport,
    selectedTransport,
    setSelectedTransport,
    wifiAddress,
    setWifiAddress,
    wifiPlayers,
    wifiDiscoveryStatus,
    bluetoothPlayers,
    selectedBluetoothAddress,
    setSelectedBluetoothAddress,
    bluetoothScanStatus,
    scanBluetooth,
    playerName,
    connectionMessage,
    connect,
    disconnect: () => {
      setConnectionStatus('disconnected');
      NativeMediaSession.clear();
    },
    pinDialogVisible,
    pinInput,
    setPinInput,
    pinError,
    pinRetryDelaySeconds,
    submitPin,
    dismissPin: () => setPinDialogVisible(false),
    currentTrack,
    isPlaying,
    positionMs,
    durationMs,
    volume,
    playbackMode,
    togglePlayback,
    nextTrack,
    previousTrack,
    seekTo,
    setVolume,
    cycleRepeatMode,
    toggleShuffle,
    queue,
    queueStatus,
    queueHasMore,
    queueLoadingMore,
    refreshQueue: () => refreshQueue(),
    removeQueueTrack: async (id: string) => {
      const api = apiRef.current;
      if (!api) return;
      const idx = queue.findIndex((t) => t.id === id);
      if (idx >= 0) {
        try {
          await api.removeFromQueue(idx, queueRevision);
          refreshQueue();
        } catch {}
      }
    },
    libraryEntries,
    libraryStatus,
    libraryQuery,
    setLibraryQuery,
    libraryCountLabel,
    libraryHasMore,
    loadLibrary,
    selectLibraryEntry,
    catalogSyncMessage,
  };
}
