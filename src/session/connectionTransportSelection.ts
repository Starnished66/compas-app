import { ConnectionStatus } from '../data/types';
import type { ConnectionTransport, RemoteUiState } from '../data/types';

/** Select a transport and discard only a failed attempt made with the previous choice. */
export function selectConnectionTransport(
  state: RemoteUiState,
  transport: ConnectionTransport,
): RemoteUiState {
  if (state.selectedConnectionTransport === transport) return state;

  const next = { ...state, selectedConnectionTransport: transport };
  if (
    state.connectionStatus === ConnectionStatus.Error &&
    !state.pinDialogVisible &&
    state.pinRetryDelaySeconds === 0
  ) {
    return { ...next, connectionStatus: ConnectionStatus.Disconnected, connectionMessage: null };
  }
  return next;
}
