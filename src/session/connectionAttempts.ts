import { createConnectionRejection, createFailureHandler, createPinCooldown } from './connectionAttemptFeedback';
import { useRef } from 'react';
import type { SessionState } from './useSessionRefs';
import { PREF_WIFI_ADDRESS, PREF_BLUETOOTH_ID } from './sessionPreferences';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PlaybackStatus, ConnectionStatus, ConnectionTransport, WifiImportStatus } from '../data/types';
import { RemoteEndpoint } from '../data/RemoteEndpoint';
import { RemoteApi } from '../data/RemoteApi';
import { SerializedHttpTransport } from '../data/HttpTransport';
import { createWifiTransport } from '../data/wifiTransport';
import { BluetoothTransport, resetPairingBlock, getBondedDevices } from '../../modules/compas-bluetooth/src/index';
import { startPlaybackService, stopPlaybackService } from '../../modules/compas-media-session/src/index';
import {
  getRequiredPermissionsForBluetooth,
  getRequiredPermissionsForWifi,
  checkPermissions,
  requestMissingPermissions,
} from './PermissionPolicy';
import type { NowPlayingArtwork } from './NowPlayingArtwork';

export interface ConnectionAttemptDependencies {
  shared: Pick<SessionState,
    'apiRef' | 'autoReconnectDueAtRef' | 'autoReconnectEnabledRef' | 'autoReconnectGenerationRef'
    | 'autoReconnectTimerRef' | 'bluetoothPairingRequiredRef'
    | 'connectionAttemptRef' | 'lastConnectionTransportRef' | 'pendingSeekRef' | 'pendingVolumeRef'
    | 'pinCooldownTimerRef' | 'pinStoreRef' | 'setState' | 'stateRef'
  >;
  activeWifiEndpointRef: React.RefObject<string | null>;
  commitConnection: (api: RemoteApi, playerKey: string, transport: ConnectionTransport, status: PlaybackStatus, features: string[], attempt: number, pinNotSaved: boolean) => void;
  dropLiveSession: () => void;
  nowPlayingArtwork: NowPlayingArtwork;
  setWifiImportStatus: React.Dispatch<React.SetStateAction<WifiImportStatus>>;
  stopPolling: () => void;
  wifiImportOperationRef: React.RefObject<number>;
}

async function createBluetoothTarget(
  stateRef: SessionState['stateRef'], btId: string | undefined, cancelled: () => boolean,
  rejectConnectChoice: (message: string) => void,
) {
  const devId = btId ?? stateRef.current.selectedBluetoothPlayerId;
  if (!devId) return null;

  // Match the native app's connect guard. Secure RFCOMM connections are only
  // supported for bonded players; attempting an unpaired address can leave
  // Android waiting on its pairing flow while the UI stays on Connecting.
  let bondedDevices: Awaited<ReturnType<typeof getBondedDevices>>;
  try {
    bondedDevices = await getBondedDevices();
  } catch (err: any) {
    if (cancelled()) return null;
    rejectConnectChoice(err?.message || 'Could not check Bluetooth pairing status. Turn Bluetooth on and try again.');
    return null;
  }
  if (cancelled()) return null;
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
    return null;
  }
  return { api: new RemoteApi(new SerializedHttpTransport(new BluetoothTransport(devId))), playerKey: `bt:${devId}` };
}

function createReconnectControls(deps: ConnectionAttemptDependencies, runAutoReconnect: () => Promise<void>) {
  const {
    autoReconnectEnabledRef, autoReconnectTimerRef, lastConnectionTransportRef,
    bluetoothPairingRequiredRef, autoReconnectDueAtRef, setState,
  } = deps.shared;

  const scheduleAutoReconnect = (initialDelayMs: number = 15000) => {
    if (!autoReconnectEnabledRef.current || autoReconnectTimerRef.current) return;
    if (lastConnectionTransportRef.current === ConnectionTransport.Bluetooth && bluetoothPairingRequiredRef.current) return;
    autoReconnectDueAtRef.current = Date.now() + initialDelayMs;
    autoReconnectTimerRef.current = setTimeout(runAutoReconnect, initialDelayMs);
  };

  const pauseForBluetoothPairing = (err: any): boolean => {
    if (err?.code !== 'BLUETOOTH_PAIRING_REQUIRED') return false;
    bluetoothPairingRequiredRef.current = true;
    if (autoReconnectTimerRef.current) clearTimeout(autoReconnectTimerRef.current);
    autoReconnectTimerRef.current = null;
    stopPlaybackService().catch(() => {});
    setState((prev) => ({ ...prev, connectionStatus: ConnectionStatus.Error, connectionMessage: 'Select a paired Bluetooth player first.' }));
    return true;
  };

  return { scheduleAutoReconnect, pauseForBluetoothPairing };
}

function createReconnectTask(
  deps: ConnectionAttemptDependencies, autoReconnectRunningRef: React.RefObject<boolean>,
  scheduleAutoReconnect: (delay: number) => void, connectDirect: ReturnType<typeof createDirectConnect>,
) {
  const {
    apiRef, autoReconnectEnabledRef, autoReconnectGenerationRef, autoReconnectTimerRef,
    bluetoothPairingRequiredRef, lastConnectionTransportRef, stateRef,
  } = deps.shared;

  const runAutoReconnect = async () => {
    autoReconnectTimerRef.current = null;
    if (!autoReconnectEnabledRef.current || apiRef.current || autoReconnectRunningRef.current) return;
    if (lastConnectionTransportRef.current === ConnectionTransport.Bluetooth && bluetoothPairingRequiredRef.current) return;
    if (stateRef.current.pinDialogVisible) {
      // Editing the PIN while a dropped link waits: try again later instead of leaving "Connecting" stuck.
      // A PIN rejection sets Error, and that wait is for the user, not for us.
      if (stateRef.current.connectionStatus === ConnectionStatus.Connecting) scheduleAutoReconnect(5000);
      return;
    }

    const generation = autoReconnectGenerationRef.current;
    const isCurrent = () => generation === autoReconnectGenerationRef.current && autoReconnectEnabledRef.current && !apiRef.current;
    autoReconnectRunningRef.current = true;
    try {
      const [savedWifi, savedBt] = await Promise.all([
        AsyncStorage.getItem(PREF_WIFI_ADDRESS), AsyncStorage.getItem(PREF_BLUETOOTH_ID),
      ]);
      if (!isCurrent()) return;
      // A saved address on another transport may belong to another player or have a stale bond.
      // Recovery follows the working session, not an unsubmitted transport selection.
      const transport = lastConnectionTransportRef.current ?? (savedWifi ? ConnectionTransport.Wifi : ConnectionTransport.Bluetooth);
      let connected = false;
      if (transport === ConnectionTransport.Wifi && savedWifi && savedWifi.trim().length > 0) {
        const wifiPerms = getRequiredPermissionsForWifi();
        const wifiOk = wifiPerms.length === 0 || (await checkPermissions(wifiPerms));
        if (wifiOk && isCurrent()) {
          startPlaybackService('Reconnecting to player…').catch(() => {});
          try {
            connected = await connectDirect(ConnectionTransport.Wifi, savedWifi.trim(), undefined, undefined, generation);
          } catch {}
        }
      }

      if (transport === ConnectionTransport.Bluetooth && savedBt && isCurrent() && !bluetoothPairingRequiredRef.current) {
        const btPerms = getRequiredPermissionsForBluetooth();
        const btOk = await checkPermissions(btPerms);
        if (btOk && isCurrent()) {
          startPlaybackService('Reconnecting to player…').catch(() => {});
          try {
            connected = await connectDirect(ConnectionTransport.Bluetooth, undefined, savedBt, undefined, generation);
          } catch {}
        }
      }

      if (!connected && isCurrent() && !stateRef.current.pinDialogVisible) {
        scheduleAutoReconnect(15000);
      }
    } finally {
      autoReconnectRunningRef.current = false;
    }
  };

  return runAutoReconnect;
}

function acceptConnectionPermission(
  result: Awaited<ReturnType<typeof requestMissingPermissions>>, cancelled: () => boolean,
  bluetooth: boolean, rejectConnectChoice: ReturnType<typeof createConnectionRejection>,
) {
  if (cancelled()) return false;
  if (result.granted) return true;
  return rejectConnectChoice(bluetooth
    ? 'Bluetooth permission was denied. Grant Nearby devices permission to connect to this player.'
    : 'Local network permission was denied. Grant Local Network permission to connect to this player.');
}

type DirectConnectionContext = Pick<ConnectionAttemptDependencies['shared'],
  'apiRef' | 'autoReconnectEnabledRef' | 'autoReconnectGenerationRef' | 'connectionAttemptRef'
  | 'pendingSeekRef' | 'pendingVolumeRef' | 'pinStoreRef' | 'setState' | 'stateRef'
> & Pick<ConnectionAttemptDependencies,
  'activeWifiEndpointRef' | 'commitConnection' | 'nowPlayingArtwork' | 'setWifiImportStatus'
  | 'stopPolling' | 'wifiImportOperationRef'
> & {
  rejectConnectChoice: ReturnType<typeof createConnectionRejection>;
  handleConnectionFailure: ReturnType<typeof createFailureHandler>;
};

const connectDirect = async function (
  this: DirectConnectionContext, transport: ConnectionTransport, wifiAddr?: string, btId?: string,
  explicitPin?: string, reconnectGeneration?: number,
): Promise<boolean> {
  const { stateRef, pinStoreRef, connectionAttemptRef, rejectConnectChoice } = this;
  const reconnecting = reconnectGeneration !== undefined;
  const generation = reconnectGeneration ?? this.autoReconnectGenerationRef.current;
  const cancelled = () => generation !== this.autoReconnectGenerationRef.current ||
    (reconnecting && !this.autoReconnectEnabledRef.current);
  if (cancelled()) return false;

  const wifi = transport === ConnectionTransport.Wifi;
  const bluetooth = transport === ConnectionTransport.Bluetooth;
  const permissions = wifi ? getRequiredPermissionsForWifi() : bluetooth ? getRequiredPermissionsForBluetooth() : [];
  if ((bluetooth || permissions.length) && !acceptConnectionPermission(
    await requestMissingPermissions(permissions), cancelled, bluetooth, rejectConnectChoice,
  )) return false;

  let wifiKey = wifi ? wifiAddr ?? stateRef.current.wifiAddress : '';
  if (wifi) {
    if (!wifiKey?.trim()) return false;
    try {
      wifiKey = RemoteEndpoint.normalizeWifiAddress(wifiKey);
    } catch (err: any) {
      return rejectConnectChoice(err?.message || 'Enter a valid player address.');
    }
  }
  const target = wifi ? { api: new RemoteApi(createWifiTransport(wifiKey)), playerKey: wifiKey }
    : await createBluetoothTarget(stateRef, btId, cancelled, rejectConnectChoice);
  if (wifi) this.activeWifiEndpointRef.current = null;
  if (!target || cancelled() || (reconnecting && this.apiRef.current)) return false;

  const attempt = ++connectionAttemptRef.current;
  this.stopPolling();
  this.nowPlayingArtwork.invalidatePending();
  this.activeWifiEndpointRef.current = null;
  this.wifiImportOperationRef.current++;
  this.setWifiImportStatus({ state: 'stopped', error: null });
  this.pendingSeekRef.current = null;
  this.pendingVolumeRef.current = null;
  const connectionMessage = 'Connecting to player…';
  this.setState((prev) => ({
    ...prev, connectionStatus: ConnectionStatus.Connecting, connectionAttemptTransport: transport, connectionMessage,
  }));
  startPlaybackService(connectionMessage).catch(() => {});

  const { api, playerKey } = target;
  const isCurrentAttempt = () => attempt === connectionAttemptRef.current && !cancelled();
  const pinToUse = explicitPin || (await pinStoreRef.current.get(playerKey)) || undefined;
  if (!isCurrentAttempt()) return false;
  if (pinToUse) api.setPin(pinToUse);

  try {
    const caps = await api.capabilities();
    if (!isCurrentAttempt()) return false;
    if (caps.version !== 1) throw new Error('Unsupported Compás protocol version');
    const status = await api.status();
    if (!isCurrentAttempt()) return false;
    // Persist before committing; cancellation during secure storage must not revive the session.
    const pinNotSaved = !!pinToUse && !(await pinStoreRef.current.put(playerKey, pinToUse));
    if (!isCurrentAttempt()) return false;
    this.commitConnection(api, playerKey, transport, status, caps.features, attempt, pinNotSaved);
    return true;
  } catch (err: any) {
    return this.handleConnectionFailure(err, transport, playerKey, pinToUse, explicitPin, isCurrentAttempt);
  }
};

function createDirectConnect(
  { shared, activeWifiEndpointRef, commitConnection, nowPlayingArtwork, setWifiImportStatus, stopPolling,
    wifiImportOperationRef }: ConnectionAttemptDependencies,
  rejectConnectChoice: ReturnType<typeof createConnectionRejection>,
  handleConnectionFailure: ReturnType<typeof createFailureHandler>,
) {
  const { apiRef, autoReconnectEnabledRef, autoReconnectGenerationRef, connectionAttemptRef,
    pendingSeekRef, pendingVolumeRef, pinStoreRef, setState, stateRef } = shared;
  return connectDirect.bind({
    apiRef, autoReconnectEnabledRef, autoReconnectGenerationRef, connectionAttemptRef,
    pendingSeekRef, pendingVolumeRef, pinStoreRef, setState, stateRef, activeWifiEndpointRef,
    commitConnection, nowPlayingArtwork, setWifiImportStatus, stopPolling, wifiImportOperationRef,
    rejectConnectChoice, handleConnectionFailure,
  });
}

function createManualConnect(
  deps: ConnectionAttemptDependencies, rejectConnectChoice: ReturnType<typeof createConnectionRejection>,
  connectDirect: ReturnType<typeof createDirectConnect>,
) {
  const {
    autoReconnectGenerationRef, autoReconnectTimerRef, bluetoothPairingRequiredRef, stateRef,
  } = deps.shared;

  const connect = async (explicitPin?: string) => {
    const generation = ++autoReconnectGenerationRef.current;
    // A pending auto-reconnect would otherwise fire mid-attempt and replace the user's choice.
    if (autoReconnectTimerRef.current) {
      clearTimeout(autoReconnectTimerRef.current);
      autoReconnectTimerRef.current = null;
    }
    const target = stateRef.current;
    if (target.selectedConnectionTransport === ConnectionTransport.Bluetooth && target.selectedBluetoothPlayerId) {
      try {
        await resetPairingBlock(target.selectedBluetoothPlayerId);
      } catch (err: any) {
        if (generation !== autoReconnectGenerationRef.current) return;
        rejectConnectChoice(err?.message || 'Could not check Bluetooth pairing status. Turn Bluetooth on and try again.');
        return;
      }
    }
    if (generation !== autoReconnectGenerationRef.current) return;
    bluetoothPairingRequiredRef.current = false;
    await connectDirect(
      target.selectedConnectionTransport,
      target.wifiAddress,
      target.selectedBluetoothPlayerId ?? undefined,
      explicitPin
    );
  };

  return connect;
}

export function useConnectionAttempts(deps: ConnectionAttemptDependencies) {
  const autoReconnectRunningRef = useRef(false);
  const runPinCooldown = createPinCooldown(deps);
  const rejectConnectChoice = createConnectionRejection(deps);
  const reconnect = createReconnectControls(deps, () => reconnectTask());
  const handleConnectionFailure = createFailureHandler(deps, runPinCooldown, reconnect);
  const directAttempt = createDirectConnect(deps, rejectConnectChoice, handleConnectionFailure);
  const reconnectTask = createReconnectTask(deps, autoReconnectRunningRef, reconnect.scheduleAutoReconnect, directAttempt);
  const connectSelected = createManualConnect(deps, rejectConnectChoice, directAttempt);

  return { runPinCooldown, runAutoReconnect: reconnectTask, connect: connectSelected, ...reconnect };
}
