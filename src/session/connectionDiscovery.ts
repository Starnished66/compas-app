import type { SessionState } from './useSessionRefs';
import { ConnectionTransport, ContentStatus, WifiPlayer } from '../data/types';
import { RemoteApi } from '../data/RemoteApi';
import { createWifiTransport } from '../data/wifiTransport';
import { discoveryEndpoint, discoveryHostnameEndpoint } from './wifiDiscovery';
import {
  startDiscovery as startBtDiscovery,
  stopDiscovery as stopBtDiscovery,
} from '../../modules/compas-bluetooth/src/index';
import {
  startDiscovery as startWifiDiscoveryModule,
  stopDiscovery as stopWifiDiscoveryModule,
  addDeviceLostListener as addWifiDeviceLostListener,
  DiscoveredWifiService,
} from '../../modules/compas-discovery/src/index';
import {
  getRequiredPermissionsForBluetooth,
  getRequiredPermissionsForWifi,
  requestMissingPermissions,
} from './PermissionPolicy';

// Native discovery events can still be queued when the hook remounts.
let nextDiscoveryGeneration = 0;

export function nextDiscoveryScanId(): number {
  return ++nextDiscoveryGeneration;
}

type ConnectionDiscoveryDependencies = Pick<SessionState,
  'discoveryGenerationRef' | 'mountedRef' | 'setState' | 'stateRef' | 'wifiAddressEditedRef'
  | 'wifiDiscoveryProbesRef' | 'wifiDiscoverySourcesRef' | 'wifiDiscoveryTimerRef'
  | 'wifiHostnameByIpRef'
>;

const ownsPicker = (
  deps: ConnectionDiscoveryDependencies,
  transport: ConnectionTransport,
  generation = deps.discoveryGenerationRef.current,
) => {
  const { discoveryGenerationRef, mountedRef, stateRef } = deps;
  return mountedRef.current && generation === discoveryGenerationRef.current &&
    stateRef.current.screen.type === 'Connection' && stateRef.current.selectedConnectionTransport === transport;
};

const resetPickerDiscovery = (deps: ConnectionDiscoveryDependencies) => {
  const {
    discoveryGenerationRef, wifiDiscoveryProbesRef, wifiDiscoverySourcesRef, wifiDiscoveryTimerRef,
  } = deps;
  clearTimeout(wifiDiscoveryTimerRef.current);
  wifiDiscoveryTimerRef.current = undefined;
  wifiDiscoverySourcesRef.current.clear();
  wifiDiscoveryProbesRef.current.clear();
  discoveryGenerationRef.current = nextDiscoveryScanId();
  return discoveryGenerationRef.current;
};

const stopPickerDiscovery = (deps: ConnectionDiscoveryDependencies) => {
  resetPickerDiscovery(deps);
  stopWifiDiscoveryModule().catch(() => {});
  stopBtDiscovery().catch(() => {});
};

const startBluetoothDiscovery = async (deps: ConnectionDiscoveryDependencies, manual: boolean) => {
  const { setState } = deps;
  if (!ownsPicker(deps, ConnectionTransport.Bluetooth)) return;
  const generation = resetPickerDiscovery(deps);
  const ownsScan = () => ownsPicker(deps, ConnectionTransport.Bluetooth, generation);
  const btPerms = getRequiredPermissionsForBluetooth();
  const permResult = await requestMissingPermissions(btPerms);
  if (!ownsScan()) return;
  if (!permResult.granted) {
    setState((prev) => ({
      ...prev,
      ...(!manual ? { bluetoothPlayers: [] } : {}),
      bluetoothScanStatus: ContentStatus.Error,
      connectionMessage: manual
        ? 'Bluetooth permissions were denied. Grant Nearby devices permission in Settings.'
        : 'Bluetooth permission was denied. Grant Nearby devices permission to find and connect to players.',
    }));
    return;
  }

  setState((prev) => ({ ...prev, bluetoothPlayers: [], bluetoothScanStatus: ContentStatus.Loading }));
  try {
    const started = await startBtDiscovery(generation);
    if (!ownsScan()) return;
    if (!started) {
      setState((prev) => ({ ...prev, bluetoothScanStatus: ContentStatus.Empty }));
    }
  } catch {
    if (ownsScan()) setState((prev) => ({ ...prev, bluetoothScanStatus: ContentStatus.Error }));
  }
};

const startWifiDiscovery = async (deps: ConnectionDiscoveryDependencies) => {
  const { setState, wifiDiscoveryTimerRef } = deps;
  if (!ownsPicker(deps, ConnectionTransport.Wifi)) return;
  const generation = resetPickerDiscovery(deps);
  const ownsScan = () => ownsPicker(deps, ConnectionTransport.Wifi, generation);
  const wifiPerms = getRequiredPermissionsForWifi();
  if (wifiPerms.length > 0) {
    const permResult = await requestMissingPermissions(wifiPerms);
    if (!ownsScan()) return;
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
    await startWifiDiscoveryModule(generation);
    if (!ownsScan()) return;
    wifiDiscoveryTimerRef.current = setTimeout(() => {
      wifiDiscoveryTimerRef.current = undefined;
      if (!ownsScan()) return;
      setState((prev) => {
        if (prev.wifiPlayers.length === 0 && prev.wifiDiscoveryStatus === ContentStatus.Loading) {
          return { ...prev, wifiDiscoveryStatus: ContentStatus.Empty };
        }
        return prev;
      });
    }, 4000);
  } catch {
    if (ownsScan()) setState((prev) => ({ ...prev, wifiDiscoveryStatus: ContentStatus.Error }));
  }
};

// Register the discovery effects here after the preceding session effects.

const onWifiFound = (deps: ConnectionDiscoveryDependencies, service: DiscoveredWifiService) => {
  const {
    discoveryGenerationRef, setState, wifiAddressEditedRef, wifiDiscoveryProbesRef,
    wifiDiscoverySourcesRef, wifiHostnameByIpRef,
  } = deps;
  const generation = service.scanId;
  if (generation !== discoveryGenerationRef.current || !ownsPicker(deps, ConnectionTransport.Wifi, generation)) return;
  const ipAddress = discoveryEndpoint(service);
  if (!ipAddress) return;
  // The player's own name (http://r1.compas.local) survives IP changes; the IP covers players
  // that could not take port 80 and phones that cannot report the name.
  // Only DNS-SD reports the name; a broadcast reply from the same IP reuses it.
  const named = discoveryHostnameEndpoint(service);
  if (named) wifiHostnameByIpRef.current.set(ipAddress, named);
  const candidates = [named ?? wifiHostnameByIpRef.current.get(ipAddress) ?? null, ipAddress]
    .filter((item): item is string => item != null);
  const address = candidates[0];
  if (wifiDiscoverySourcesRef.current.size >= 64 && !wifiDiscoverySourcesRef.current.has(service.id)) return;
  wifiDiscoverySourcesRef.current.set(service.id, address);
  if (wifiDiscoveryProbesRef.current.has(address)) return;
  if (wifiDiscoveryProbesRef.current.size >= 32) return;
  wifiDiscoveryProbesRef.current.add(address);
  const ownsProbe = () => ownsPicker(deps, ConnectionTransport.Wifi, generation) &&
    wifiDiscoverySourcesRef.current.get(service.id) === address;
  void (async () => {
    try {
      let reachable: string | null = null;
      for (const candidate of candidates) {
        try {
          // Resolving a .local name the first time can take a couple of seconds.
          const timeoutMs = candidate === ipAddress ? 1500 : 5000;
          const capabilities = await new RemoteApi(createWifiTransport(candidate, timeoutMs)).capabilities();
          if (!ownsProbe()) return;
          if (capabilities.version === 1 && capabilities.features.includes('status')) {
            reachable = candidate;
            break;
          }
        } catch {
          if (!ownsProbe()) return;
        }
      }
      if (!reachable || !ownsProbe()) return;
      wifiDiscoverySourcesRef.current.set(service.id, reachable);
      setState((prev) => {
        if (generation !== discoveryGenerationRef.current || prev.screen.type !== 'Connection' ||
            prev.selectedConnectionTransport !== ConnectionTransport.Wifi) return prev;
        const player: WifiPlayer = { id: `wifi:${reachable}`, name: service.name || 'Compás Player', address: reachable };
        // Once the name answers, the same player's IP entry is redundant.
        const others = reachable === ipAddress ? prev.wifiPlayers : prev.wifiPlayers.filter((item) => item.address !== ipAddress);
        const updated = others.some((item) => item.address === reachable)
          ? others.map((item) => item.address === reachable ? player : item)
          : [...others, player];
        return { ...prev, wifiPlayers: updated, wifiDiscoveryStatus: ContentStatus.Ready,
          wifiAddress: !wifiAddressEditedRef.current && !prev.wifiAddress ? reachable : prev.wifiAddress };
      });
    } catch { /* An advertisement is not proof of a compatible player. */ }
    finally { if (generation === discoveryGenerationRef.current) wifiDiscoveryProbesRef.current.delete(address); }
  })();
};

const onWifiLost = (deps: ConnectionDiscoveryDependencies, event: Parameters<Parameters<typeof addWifiDeviceLostListener>[0]>[0]) => {
  const { discoveryGenerationRef, setState, wifiDiscoverySourcesRef } = deps;
  if (event.scanId !== discoveryGenerationRef.current || !ownsPicker(deps, ConnectionTransport.Wifi, event.scanId)) return;
  const address = wifiDiscoverySourcesRef.current.get(event.id);
  wifiDiscoverySourcesRef.current.delete(event.id);
  if (address && ![...wifiDiscoverySourcesRef.current.values()].includes(address)) {
    setState((prev) => event.scanId === discoveryGenerationRef.current
      ? { ...prev, wifiPlayers: prev.wifiPlayers.filter((item) => item.address !== address) }
      : prev);
  }
};

export function createConnectionDiscovery(deps: ConnectionDiscoveryDependencies) {
  return {
    ownsPicker: ownsPicker.bind(undefined, deps),
    stopPickerDiscovery: stopPickerDiscovery.bind(undefined, deps),
    startBluetoothDiscovery: startBluetoothDiscovery.bind(undefined, deps),
    startWifiDiscovery: startWifiDiscovery.bind(undefined, deps),
    onWifiFound: onWifiFound.bind(undefined, deps),
    onWifiLost: onWifiLost.bind(undefined, deps),
  };
}
