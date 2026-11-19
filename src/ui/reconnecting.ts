import { ConnectionStatus, RemoteUiState } from '../data/types';

export function isReconnecting(state: Pick<RemoteUiState, 'connectionStatus' | 'currentTrack'>): boolean {
  return (
    Boolean(state.currentTrack) &&
    (state.connectionStatus === ConnectionStatus.Connecting || state.connectionStatus === ConnectionStatus.Error)
  );
}
