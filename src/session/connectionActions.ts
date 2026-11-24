import type { SessionState } from './useSessionRefs';
import { type ActionOf } from './remoteActionDispatch';
import { PREF_WIFI_ADDRESS, PREF_BLUETOOTH_ID, PREF_AUTO_RECONNECT } from './sessionPreferences';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ConnectionTransport } from '../data/types';
import { persistSavedProfiles, pinKeyForProfile, removeSavedProfile } from '../data/SavedProfilesStore';
import { selectConnectionTransport } from './connectionTransportSelection';
import { pairDevice as pairBtDevice } from '../../modules/compas-bluetooth/src/index';
import { getRequiredPermissionsForBluetooth, requestMissingPermissions } from './PermissionPolicy';

interface ConnectionActionsDependencies {
  shared: Pick<SessionState,
    'autoReconnectEnabledRef' | 'autoReconnectTimerRef' | 'pinStoreRef' | 'setState' | 'stateRef'
    | 'wifiAddressEditedRef'
  >;
  connect: (explicitPin?: string | undefined) => Promise<void>;
  disconnect: () => void;
  scheduleAutoReconnect: (initialDelayMs?: number) => void;
  startBluetoothDiscovery: (manual: boolean) => Promise<void>;
  startWifiDiscovery: () => Promise<void>;
}

const connectSelected = (deps: ConnectionActionsDependencies) => {
  const { connect } = deps;
  connect();
};

const handleStartAutoReconnect = (deps: ConnectionActionsDependencies) => {
  const { autoReconnectEnabledRef, autoReconnectTimerRef } = deps.shared;
  const { scheduleAutoReconnect } = deps;
  if (autoReconnectEnabledRef.current) {
    if (autoReconnectTimerRef.current) {
      clearTimeout(autoReconnectTimerRef.current);
      autoReconnectTimerRef.current = null;
    }
    scheduleAutoReconnect(0);
  }
};

const handleDisconnect = (deps: ConnectionActionsDependencies) => {
  const { autoReconnectEnabledRef } = deps.shared;
  const { disconnect } = deps;
  autoReconnectEnabledRef.current = false;
  AsyncStorage.setItem(PREF_AUTO_RECONNECT, 'false').catch(() => {});
  disconnect();
};

const handleSetWifiAddress = (deps: ConnectionActionsDependencies, action: ActionOf<'SetWifiAddress'>) => {
  const { setState, wifiAddressEditedRef } = deps.shared;
  wifiAddressEditedRef.current = true;
  setState((prev) => ({ ...prev, wifiAddress: action.address }));
};

const handleSelectWifiPlayer = (deps: ConnectionActionsDependencies, action: ActionOf<'SelectWifiPlayer'>) => {
  const { setState, stateRef, wifiAddressEditedRef } = deps.shared;
  const p = stateRef.current.wifiPlayers.find((x) => x.id === action.id);
  if (p) {
    wifiAddressEditedRef.current = true;
    AsyncStorage.setItem(PREF_WIFI_ADDRESS, p.address).catch(() => {});
    setState((prev) => ({ ...prev, wifiAddress: p.address }));
  }
};

const handleRetryWifiDiscovery = (deps: ConnectionActionsDependencies) => {
  const { startWifiDiscovery } = deps;
  startWifiDiscovery();
};

const handleSelectConnectionTransport = (deps: ConnectionActionsDependencies, action: ActionOf<'SelectConnectionTransport'>) => {
  const { setState } = deps.shared;
  setState((prev) => selectConnectionTransport(prev, action.transport));
};

const handleScanBluetoothPlayers = (deps: ConnectionActionsDependencies) => {
  const { startBluetoothDiscovery } = deps;
  void startBluetoothDiscovery(true);
};

const handleSelectBluetoothPlayer = (deps: ConnectionActionsDependencies, action: ActionOf<'SelectBluetoothPlayer'>) => {
  const { setState } = deps.shared;
  AsyncStorage.setItem(PREF_BLUETOOTH_ID, action.id).catch(() => {});
  setState((prev) => ({ ...prev, selectedBluetoothPlayerId: action.id }));
};

const handlePairBluetoothPlayer = async (deps: ConnectionActionsDependencies, action: ActionOf<'PairBluetoothPlayer'>) => {
  const { setState } = deps.shared;
  const btPerms = getRequiredPermissionsForBluetooth();
  const permResult = await requestMissingPermissions(btPerms);
  if (!permResult.granted) {
    setState((prev) => ({
      ...prev,
      connectionMessage:
        'Bluetooth permissions were denied. Grant Nearby devices permission in Settings.',
    }));
    return;
  }
  pairBtDevice(action.id).catch((err: any) => {
    setState((prev) => ({ ...prev, connectionMessage: err?.message || 'Could not pair with this player.' }));
  });
};

const handleSetPinInput = (deps: ConnectionActionsDependencies, action: ActionOf<'SetPinInput'>) => {
  const { setState } = deps.shared;
  setState((prev) => ({ ...prev, pinInput: action.value, pinError: null }));
};

const handleSubmitPin = (deps: ConnectionActionsDependencies) => {
  const { setState, stateRef } = deps.shared;
  const { connect } = deps;
  if (/^[0-9]{4,12}$/.test(stateRef.current.pinInput)) {
    connect(stateRef.current.pinInput);
  } else {
    setState((prev) => ({ ...prev, pinError: 'Enter 4 to 12 digits' }));
  }
};

const handleDismissPin = (deps: ConnectionActionsDependencies) => {
  const { setState } = deps.shared;
  setState((prev) => ({ ...prev, pinDialogVisible: false, pinInput: '', pinError: null }));
};

const handleSwitchSavedProfile = (deps: ConnectionActionsDependencies, action: ActionOf<'SwitchSavedProfile'>) => {
  const { setState, stateRef, wifiAddressEditedRef } = deps.shared;
  const { connect } = deps;
  const profile = (stateRef.current.savedProfiles ?? []).find((item) => item.id === action.id);
  if (!profile) return;
  const nextState = {
    ...selectConnectionTransport(stateRef.current, profile.transport),
    ...(profile.transport === ConnectionTransport.Wifi
      ? { wifiAddress: profile.endpoint }
      : { selectedBluetoothPlayerId: profile.endpoint }),
  };
  if (profile.transport === ConnectionTransport.Wifi) {
    wifiAddressEditedRef.current = true;
    AsyncStorage.setItem(PREF_WIFI_ADDRESS, profile.endpoint).catch(() => {});
  } else {
    AsyncStorage.setItem(PREF_BLUETOOTH_ID, profile.endpoint).catch(() => {});
  }
  stateRef.current = nextState;
  setState(nextState);
  void connect();
};

const handleRemoveSavedProfile = (deps: ConnectionActionsDependencies, action: ActionOf<'RemoveSavedProfile'>) => {
  const { pinStoreRef, setState, stateRef } = deps.shared;
  const current = stateRef.current.savedProfiles ?? [];
  const target = current.find((item) => item.id === action.id);
  if (!target) return;
  const next = removeSavedProfile(current, action.id);
  void persistSavedProfiles(next);
  void pinStoreRef.current.remove(pinKeyForProfile(target));
  setState((prev) => ({ ...prev, savedProfiles: next }));
};

const handleChangePin = (deps: ConnectionActionsDependencies) => {
  const { setState } = deps.shared;
  setState((prev) => ({ ...prev, pinDialogVisible: true, pinInput: '', pinError: null }));
};

export function createConnectionActions(deps: ConnectionActionsDependencies) {
  const connectionActions = {
    StartAutoReconnect: handleStartAutoReconnect.bind(undefined, deps),
    Connect: connectSelected.bind(undefined, deps),
    RetryConnection: connectSelected.bind(undefined, deps),
    Disconnect: handleDisconnect.bind(undefined, deps),
    SetWifiAddress: handleSetWifiAddress.bind(undefined, deps),
    SelectWifiPlayer: handleSelectWifiPlayer.bind(undefined, deps),
    RetryWifiDiscovery: handleRetryWifiDiscovery.bind(undefined, deps),
    SelectConnectionTransport: handleSelectConnectionTransport.bind(undefined, deps),
    ScanBluetoothPlayers: handleScanBluetoothPlayers.bind(undefined, deps),
    SelectBluetoothPlayer: handleSelectBluetoothPlayer.bind(undefined, deps),
    PairBluetoothPlayer: handlePairBluetoothPlayer.bind(undefined, deps),
    SwitchSavedProfile: handleSwitchSavedProfile.bind(undefined, deps),
    RemoveSavedProfile: handleRemoveSavedProfile.bind(undefined, deps),
    SetPinInput: handleSetPinInput.bind(undefined, deps),
    SubmitPin: handleSubmitPin.bind(undefined, deps),
    DismissPin: handleDismissPin.bind(undefined, deps),
    ChangePin: handleChangePin.bind(undefined, deps),
  };
  return { connectionActions };
}
