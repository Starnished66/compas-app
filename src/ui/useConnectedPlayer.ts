import { useEffect, useState } from 'react';
import { ConnectionStatus, RemoteUiState } from '../data/types';
import { connectedPlayerSummary, PlayerSummary } from './connectionSummary';

export interface ConnectedPlayer extends PlayerSummary {
  wifiAddress: string;
  bluetoothId: string | null | undefined;
}

function useValueHeldWhileConnected<T>(status: ConnectionStatus, value: T): T {
  const [held, setHeld] = useState(value);
  useEffect(() => {
    if (status !== ConnectionStatus.Connected) setHeld(value);
  }, [status, value]);
  return status === ConnectionStatus.Connected ? held : value;
}

export function useConnectedPlayer(state: RemoteUiState): ConnectedPlayer {
  const wifiAddress = useValueHeldWhileConnected(state.connectionStatus, state.wifiAddress.trim());
  const bluetoothId = useValueHeldWhileConnected(state.connectionStatus, state.selectedBluetoothPlayerId);
  return { ...connectedPlayerSummary(state, { wifiAddress, bluetoothId }), wifiAddress, bluetoothId };
}
