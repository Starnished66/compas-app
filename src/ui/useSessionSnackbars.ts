import { useEffect, useRef } from 'react';
import { RemoteUiState } from '../data/types';
import { initialSessionMemory, SessionMemory, stepSession } from './sessionSnackbarEvents';
import { useSnackbar } from './snackbar/useSnackbar';

export { connectionMessageShownInline } from './sessionSnackbarEvents';

export function useSessionSnackbars(state: RemoteUiState): void {
  const { show } = useSnackbar();
  const memory = useRef<SessionMemory | null>(null);

  useEffect(() => {
    if (!memory.current) {
      memory.current = initialSessionMemory(state);
      return;
    }
    const step = stepSession(memory.current, state);
    memory.current = step.memory;
    if (step.message) show({ text: step.message });
  }, [show, state]);
}
