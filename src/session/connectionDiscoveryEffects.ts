import { useEffect } from 'react';
import { ConnectionTransport, ContentStatus, type RemoteUiState } from '../data/types';
import {
  stopDiscovery as stopBtDiscovery,
  addDeviceFoundListener as addBtDeviceFoundListener,
  addBondStateListener as addBtBondStateListener,
  addDiscoveryFinishedListener as addBtDiscoveryFinishedListener,
} from '../../modules/compas-bluetooth/src/index';
import {
  stopDiscovery as stopWifiDiscoveryModule,
  addDeviceFoundListener as addWifiDeviceFoundListener,
  addDeviceLostListener as addWifiDeviceLostListener,
} from '../../modules/compas-discovery/src/index';
import type { createConnectionDiscovery } from './connectionDiscovery';
import type { SessionState } from './useSessionRefs';

type DiscoverySubscriptions = {
  shared: Pick<SessionState, 'discoveryGenerationRef' | 'mountedRef' | 'setState'>;
  state: RemoteUiState;
} & ReturnType<typeof createConnectionDiscovery>;

function useBluetoothDiscoveryEvents({
  shared: { discoveryGenerationRef, mountedRef, setState }, ownsPicker,
}: Pick<DiscoverySubscriptions, 'shared' | 'ownsPicker'>) {
  // Bluetooth event subscriptions
  useEffect(() => {
    const dSub = addBtDeviceFoundListener((evt) => {
      if (evt.scanId !== discoveryGenerationRef.current || !ownsPicker(ConnectionTransport.Bluetooth)) return;
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
      if (!mountedRef.current) return;
      setState((prev) => ({
        ...prev,
        bluetoothPlayers: prev.bluetoothPlayers.map((p) =>
          p.id === evt.id ? { ...p, paired: evt.paired, bonding: evt.bonding } : p
        ),
      }));
    });

    const fSub = addBtDiscoveryFinishedListener((evt) => {
      if (evt.scanId !== discoveryGenerationRef.current || !ownsPicker(ConnectionTransport.Bluetooth)) return;
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

}

export function useConnectionDiscoveryEffects(deps: DiscoverySubscriptions) {
  const { state, stopPickerDiscovery, startWifiDiscovery, startBluetoothDiscovery, onWifiFound, onWifiLost } = deps;

  useEffect(() => {
    if (state.screen.type !== 'Connection') {
      stopPickerDiscovery();
    } else if (state.selectedConnectionTransport === ConnectionTransport.Wifi) {
      stopBtDiscovery().catch(() => {});
      void startWifiDiscovery();
    } else {
      stopWifiDiscoveryModule().catch(() => {});
      void startBluetoothDiscovery(false);
    }
  }, [state.screen.type, state.selectedConnectionTransport]);

  useBluetoothDiscoveryEvents({ shared: deps.shared, ownsPicker: deps.ownsPicker });

  // Generation ownership prevents late NSD or UDP replies from reviving an abandoned scan.
  useEffect(() => {
    const found = addWifiDeviceFoundListener(onWifiFound);
    const lost = addWifiDeviceLostListener(onWifiLost);
    return () => { found?.remove(); lost?.remove(); };
  }, []);
}
