import { RemoteUiState } from '../../data/types';
import { useSessionSnackbars } from '../useSessionSnackbars';

export function SessionSnackbars({ state }: { state: RemoteUiState }) {
  useSessionSnackbars(state);
  return null;
}
