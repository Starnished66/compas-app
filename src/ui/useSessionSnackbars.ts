import { useEffect, useRef } from 'react';
import { RemoteUiState } from '../data/types';
import { initialSessionMemory, SessionMemory, stepSession } from './sessionSnackbarEvents';
import { useSnackbar } from './snackbar/useSnackbar';
import { useI18n } from '../i18n';

export { connectionMessageShownInline } from './sessionSnackbarEvents';

export function useSessionSnackbars(state: RemoteUiState): void {
  const { show } = useSnackbar();
  const { t } = useI18n();
  const memory = useRef<SessionMemory | null>(null);

  useEffect(() => {
    if (!memory.current) {
      memory.current = initialSessionMemory(state);
      return;
    }
    const step = stepSession(memory.current, state, t);
    memory.current = step.memory;
    if (step.message) show({ text: step.message });
  }, [show, state, t]);
}
