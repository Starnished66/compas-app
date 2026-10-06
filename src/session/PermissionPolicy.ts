import { PermissionsAndroid, Platform, Permission } from 'react-native';
import { RemoteAction, ConnectionTransport } from '../data/types';

export const PERMISSION_ACCESS_LOCAL_NETWORK = 'android.permission.ACCESS_LOCAL_NETWORK';
export const PERMISSION_BLUETOOTH_SCAN = 'android.permission.BLUETOOTH_SCAN';
export const PERMISSION_BLUETOOTH_CONNECT = 'android.permission.BLUETOOTH_CONNECT';
export const PERMISSION_ACCESS_FINE_LOCATION = 'android.permission.ACCESS_FINE_LOCATION';

export function getAndroidApiLevel(): number {
  if (Platform.OS !== 'android') return 0;
  return typeof Platform.Version === 'number'
    ? Platform.Version
    : parseInt(String(Platform.Version), 10) || 0;
}

export function getRequiredPermissionsForBluetooth(): string[] {
  if (Platform.OS !== 'android') return [];
  const apiLevel = getAndroidApiLevel();
  if (apiLevel >= 31) {
    return [PERMISSION_BLUETOOTH_SCAN, PERMISSION_BLUETOOTH_CONNECT];
  }
  return [PERMISSION_ACCESS_FINE_LOCATION];
}

export function getRequiredPermissionsForWifi(): string[] {
  if (Platform.OS !== 'android') return [];
  const apiLevel = getAndroidApiLevel();
  if (apiLevel >= 37) {
    return [PERMISSION_ACCESS_LOCAL_NETWORK];
  }
  return [];
}

/**
 * Mirrors the exact Android permission policy from MainActivity.kt:
 * - StartAutoReconnect: ACCESS_LOCAL_NETWORK (API 37+) + BLUETOOTH_SCAN & BLUETOOTH_CONNECT (API 31+) or ACCESS_FINE_LOCATION (<31)
 * - Wifi actions on API 37+: ACCESS_LOCAL_NETWORK
 * - Bluetooth actions: BLUETOOTH_SCAN & BLUETOOTH_CONNECT (API 31+) or ACCESS_FINE_LOCATION (<31)
 * - Other actions: none
 */
export function getRequiredPermissionsForAction(
  action: RemoteAction,
  selectedTransport: ConnectionTransport
): string[] {
  if (Platform.OS !== 'android') return [];
  const apiLevel = getAndroidApiLevel();

  const wifiAction =
    (action.type === 'OpenConnection' && selectedTransport === ConnectionTransport.Wifi) ||
    (action.type === 'SelectConnectionTransport' && action.transport === ConnectionTransport.Wifi) ||
    action.type === 'RetryWifiDiscovery' ||
    ((action.type === 'Connect' ||
      action.type === 'RetryConnection' ||
      action.type === 'SubmitPin' ||
      action.type === 'ChangePin') &&
      selectedTransport === ConnectionTransport.Wifi);

  const bluetoothAction =
    action.type === 'ScanBluetoothPlayers' ||
    action.type === 'PairBluetoothPlayer' ||
    (action.type === 'OpenConnection' && selectedTransport === ConnectionTransport.Bluetooth) ||
    (action.type === 'SelectConnectionTransport' && action.transport === ConnectionTransport.Bluetooth) ||
    ((action.type === 'Connect' ||
      action.type === 'RetryConnection' ||
      action.type === 'SubmitPin' ||
      action.type === 'ChangePin') &&
      selectedTransport === ConnectionTransport.Bluetooth);

  if (action.type === 'StartAutoReconnect') {
    const list: string[] = [];
    if (apiLevel >= 37) {
      list.push(PERMISSION_ACCESS_LOCAL_NETWORK);
    }
    if (apiLevel >= 31) {
      list.push(PERMISSION_BLUETOOTH_SCAN, PERMISSION_BLUETOOTH_CONNECT);
    } else {
      list.push(PERMISSION_ACCESS_FINE_LOCATION);
    }
    return list;
  }

  if (wifiAction && apiLevel >= 37) {
    return [PERMISSION_ACCESS_LOCAL_NETWORK];
  }

  if (!bluetoothAction) {
    return [];
  }

  if (apiLevel >= 31) {
    return [PERMISSION_BLUETOOTH_SCAN, PERMISSION_BLUETOOTH_CONNECT];
  }

  return [PERMISSION_ACCESS_FINE_LOCATION];
}

export async function checkPermissions(permissions: string[]): Promise<boolean> {
  if (Platform.OS !== 'android' || permissions.length === 0) return true;
  try {
    for (const perm of permissions) {
      const granted = await PermissionsAndroid.check(perm as Permission);
      if (!granted) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function requestMissingPermissions(
  permissions: string[]
): Promise<{ granted: boolean; missing: string[]; denied: string[] }> {
  if (Platform.OS !== 'android' || permissions.length === 0) {
    return { granted: true, missing: [], denied: [] };
  }

  try {
    const missing: string[] = [];
    for (const perm of permissions) {
      const has = await PermissionsAndroid.check(perm as Permission).catch(() => false);
      if (!has) {
        missing.push(perm);
      }
    }

    if (missing.length === 0) {
      return { granted: true, missing: [], denied: [] };
    }

    const results = await PermissionsAndroid.requestMultiple(missing as Permission[]);
    const denied: string[] = [];

    for (const perm of missing) {
      if ((results as Record<string, string>)[perm] !== PermissionsAndroid.RESULTS.GRANTED) {
        denied.push(perm);
      }
    }

    return {
      granted: denied.length === 0,
      missing,
      denied,
    };
  } catch {
    return { granted: false, missing: permissions, denied: permissions };
  }
}
