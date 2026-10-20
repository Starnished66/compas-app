import { ConnectionStatus, ConnectionTransport, RemoteUiState } from '../data/types';
import { ConnectionStatus as IndicatorStatus } from './components/StatusIndicator';
import { connectionStatusKind, connectionStatusLabel } from './connectionStatusDisplay';

export interface ConnectionStatusView {
  status: IndicatorStatus;
  label: string;
}

export interface PlayerSummary {
  name: string;
  detail: string;
}

export function connectionStatusView(
  state: Pick<RemoteUiState, 'connectionStatus' | 'pinDialogVisible'>,
): ConnectionStatusView {
  if (state.pinDialogVisible && state.connectionStatus !== ConnectionStatus.Connected) {
    return { status: 'busy', label: 'PIN needed' };
  }
  return {
    status: connectionStatusKind(state.connectionStatus),
    label: connectionStatusLabel(state.connectionStatus),
  };
}

export function connectedPlayerSummary(
  state: Pick<RemoteUiState, 'connectionTransport' | 'connectionAttemptTransport' | 'bluetoothPlayers' | 'wifiPlayers' | 'playerName'>,
  connected: { wifiAddress: string; bluetoothId: string | null | undefined },
): PlayerSummary {
  const transport = state.connectionAttemptTransport ?? state.connectionTransport;
  if (transport === ConnectionTransport.Bluetooth) {
    const player = state.bluetoothPlayers.find((candidate) => candidate.id === connected.bluetoothId);
    return { name: player?.name ?? state.playerName, detail: 'Bluetooth' };
  }
  const player = state.wifiPlayers.find((candidate) => candidate.address === connected.wifiAddress);
  return { name: player?.name ?? state.playerName, detail: connected.wifiAddress };
}
