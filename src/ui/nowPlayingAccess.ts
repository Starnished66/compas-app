import { ConnectionStatus, RemoteUiState } from '../data/types';
import { isReconnecting } from './reconnecting';

export function canOpenNowPlaying(state: RemoteUiState): boolean {
  return Boolean(state.currentTrack) && (state.connectionStatus === ConnectionStatus.Connected || isReconnecting(state));
}
