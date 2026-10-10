import { ConnectionStatus, RemoteUiState } from '../data/types';

export function isReconnecting(state: RemoteUiState): boolean {
  return (
    Boolean(state.currentTrack) &&
    (state.connectionStatus === ConnectionStatus.Connecting || state.connectionStatus === ConnectionStatus.Error)
  );
}
