import { ConnectionStatus, ConnectionTransport, RemoteUiState } from '../data/types';
import { checkPlayerAddress } from './playerAddress';
import { ConnectedPlayer } from './useConnectedPlayer';

export interface ConnectTarget {
  key: string;
  name: string;
}

function wifiKey(address: string): string {
  return `wifi:${address.trim()}`;
}

function bluetoothKey(id: string): string {
  return `bt:${id.toLowerCase()}`;
}

function wifiTarget(state: RemoteUiState, manualOpen: boolean): ConnectTarget | null {
  const address = state.wifiAddress.trim();
  if (!address) return null;
  if (manualOpen && checkPlayerAddress(address) !== 'valid') return null;
  const player = state.wifiPlayers.find((candidate) => candidate.address === address);
  return { key: wifiKey(address), name: player?.name ?? address };
}

function bluetoothTarget(state: RemoteUiState): ConnectTarget | null {
  const id = state.selectedBluetoothPlayerId;
  if (!id) return null;
  const player = state.bluetoothPlayers.find((candidate) => candidate.id === id);
  if (player && !player.paired) return null;
  return { key: bluetoothKey(id), name: player?.name ?? state.playerName };
}

export function connectTarget(
  state: RemoteUiState,
  transport: ConnectionTransport,
  manualOpen: boolean,
): ConnectTarget | null {
  return transport === ConnectionTransport.Bluetooth ? bluetoothTarget(state) : wifiTarget(state, manualOpen);
}

export function connectedPlayerKey(state: RemoteUiState, player: ConnectedPlayer): string | null {
  if (state.connectionStatus !== ConnectionStatus.Connected) return null;
  if (state.connectionTransport === ConnectionTransport.Bluetooth) {
    return player.bluetoothId ? bluetoothKey(player.bluetoothId) : null;
  }
  return wifiKey(player.wifiAddress);
}

export function connectButtonLabel(
  target: ConnectTarget | null,
  connected: boolean,
  enteringAddress: boolean,
  retryDelaySeconds: number,
): string {
  if (retryDelaySeconds > 0) return `Wait ${retryDelaySeconds} s`;
  if (target) return `${connected ? 'Switch to' : 'Connect to'} ${target.name}`;
  return enteringAddress ? 'Enter an address' : 'Choose a player';
}
