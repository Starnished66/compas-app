import { useCallback } from 'react';
import { ConnectionStatus, ConnectionTransport, ContentStatus, type RemoteAction } from '../data/types';
import { getRequiredPermissionsForAction, requestMissingPermissions } from './PermissionPolicy';
import type { SessionState } from './useSessionRefs';

type ActionsByType = { [Action in RemoteAction as Action['type']]: Action };
export type ActionOf<Type extends keyof ActionsByType> = ActionsByType[Type];

type Handlers = {
  [Type in keyof ActionsByType]: (action: ActionOf<Type>) => void | Promise<void>;
};

function dispatchRemoteAction<Type extends keyof ActionsByType>(
  action: ActionOf<Type> & { type: Type },
  handlers: SessionActionHandlers,
): void | Promise<void> {
  const byType: Partial<Handlers> = handlers;
  if (Object.prototype.hasOwnProperty.call(byType, action.type)) return byType[action.type]?.(action);
}

// CyclePlaybackMode has no handler in the public action union's existing dispatch.
type SessionActionHandlers = Omit<Handlers, 'CyclePlaybackMode'>;

interface ActionDispatcherInputs {
  shared: Pick<SessionState, 'mountedRef' | 'discoveryGenerationRef' | 'stateRef' | 'setState'>;
  ownsPicker: (transport: ConnectionTransport, generation?: number) => boolean;
  handlers: SessionActionHandlers;
}

export function useRemoteActionDispatcher({
  shared, ownsPicker, handlers,
}: ActionDispatcherInputs) {
  const { mountedRef, discoveryGenerationRef, stateRef, setState } = shared;
  return useCallback(async (action: RemoteAction) => {
    if (!mountedRef.current) return;
    // Check runtime permissions matching Android MainActivity
    const requiredPerms = getRequiredPermissionsForAction(
      action,
      stateRef.current.selectedConnectionTransport
    );
    if (requiredPerms.length > 0) {
      const discoveryGeneration = discoveryGenerationRef.current;
      const permResult = await requestMissingPermissions(requiredPerms);
      if (!mountedRef.current) return;
      if (action.type === 'ScanBluetoothPlayers' && !ownsPicker(ConnectionTransport.Bluetooth, discoveryGeneration)) return;
      if (action.type === 'RetryWifiDiscovery' && !ownsPicker(ConnectionTransport.Wifi, discoveryGeneration)) return;
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

    return dispatchRemoteAction(action, handlers);
  }, []);
}
