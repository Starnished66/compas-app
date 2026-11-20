import { useEffect, type RefObject } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ConnectionStatus, ConnectionTransport, type RemoteAction, type RemoteUiState } from '../data/types';
import { addBackgroundTickListener, addMediaActionListener } from '../../modules/compas-media-session/src/index';
import {
  PREF_AUTO_RECONNECT, PREF_BLUETOOTH_ID, PREF_LAST_TRANSPORT, PREF_THEME, PREF_WIFI_ADDRESS, themeFromPreference,
} from './sessionPreferences';
import { useMediaSessionSync } from './useMediaSessionSync';
import type { SessionState } from './useSessionRefs';

interface SessionEffectsInputs {
  shared: Pick<SessionState,
    'apiRef' | 'appForegroundRef' | 'autoReconnectDueAtRef' | 'autoReconnectEnabledRef' | 'autoReconnectTimerRef' |
    'bulkActionCancelledRef' | 'catalogSyncProgress' | 'lastConnectionTransportRef' | 'latestPlayingRef' |
    'mountedRef' | 'positionStoreRef' | 'setState' | 'stateRef'
  >;
  state: RemoteUiState;
  onAction: (action: RemoteAction) => Promise<void>;
  scheduleAutoReconnect: (delay: number) => void;
  reconcileAfterMediaAction: () => void;
  unmountSession: () => void;
  startPollingLoop: (immediate?: boolean) => void;
  runAutoReconnect: () => Promise<void>;
  wifiUpgradeScanCleanupRef: RefObject<(() => void) | null>;
}

function useRestorePreferences({ shared, scheduleAutoReconnect }: SessionEffectsInputs) {
  const { autoReconnectEnabledRef, lastConnectionTransportRef, setState } = shared;
  // Restore stored preferences
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const keys = [PREF_THEME, PREF_WIFI_ADDRESS, PREF_BLUETOOTH_ID, PREF_LAST_TRANSPORT, PREF_AUTO_RECONNECT];
        const saved = new Map(await AsyncStorage.multiGet(keys));
        const [savedTheme, savedWifi, savedBt, savedTransport, savedAuto] = keys.map((key) => saved.get(key) ?? null);

        if (cancelled) return;
        const autoReconnect = savedAuto !== 'false';
        autoReconnectEnabledRef.current = autoReconnect;
        lastConnectionTransportRef.current = savedTransport === 'bluetooth'
          ? ConnectionTransport.Bluetooth
          : savedWifi ? ConnectionTransport.Wifi : savedBt ? ConnectionTransport.Bluetooth : null;

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
    return () => { cancelled = true; };
  }, []);
}

function useMediaActionCommands({ shared, onAction, reconcileAfterMediaAction }: SessionEffectsInputs) {
  const { latestPlayingRef } = shared;
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
}

function useStatusTickEvents({ shared, runAutoReconnect, startPollingLoop }: SessionEffectsInputs) {
  const { apiRef, appForegroundRef, autoReconnectDueAtRef, autoReconnectTimerRef, stateRef } = shared;
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
}

export function useSessionEffects(deps: SessionEffectsInputs) {
  const { shared, state, unmountSession, wifiUpgradeScanCleanupRef } = deps;
  const { bulkActionCancelledRef, catalogSyncProgress, latestPlayingRef, mountedRef, positionStoreRef } = shared;

  useEffect(() => () => { bulkActionCancelledRef.current = true; }, []);

  useEffect(() => {
    latestPlayingRef.current = state.isPlaying;
  }, [state.isPlaying]);

  useEffect(() => {
    if (state.connectionStatus === ConnectionStatus.Disconnected) catalogSyncProgress.set(null);
  }, [catalogSyncProgress, state.connectionStatus]);

  useRestorePreferences(deps);
  useMediaActionCommands(deps);

  useMediaSessionSync(state, positionStoreRef.current);

  // Invalidate session work before releasing its timers and discovery subscriptions.
  useEffect(() => {
    mountedRef.current = true;
    return unmountSession;
  }, []);

  useStatusTickEvents(deps);

  useEffect(() => {
    if (state.connectionStatus !== ConnectionStatus.Connected || state.connectionTransport !== ConnectionTransport.Bluetooth) {
      wifiUpgradeScanCleanupRef.current?.();
      wifiUpgradeScanCleanupRef.current = null;
    }
  }, [state.connectionStatus, state.connectionTransport]);
}
