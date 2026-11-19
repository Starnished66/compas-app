import { useEffect, useRef } from 'react';
import { RemoteUiState } from '../data/types';
import { initialSessionMemory, SessionMemory, stepSession } from './sessionSnackbarEvents';
import { useSnackbar } from './snackbar/useSnackbar';
import { useCatalogSyncProgress } from './library/catalogSyncProgressContext';
import { useI18n } from '../i18n';

export { connectionMessageShownInline } from './sessionSnackbarEvents';

export function useSessionSnackbars(state: RemoteUiState): void {
  const { show } = useSnackbar();
  const { t } = useI18n();
  const catalogSyncMessage = useCatalogSyncProgress();
  const memory = useRef<SessionMemory | null>(null);

  useEffect(() => {
    const snapshot = { ...state, catalogSyncMessage };
    if (!memory.current) {
      memory.current = initialSessionMemory(snapshot);
      return;
    }
    const step = stepSession(memory.current, snapshot, t);
    memory.current = step.memory;
    if (step.message) show({ text: step.message });
  }, [show, state, catalogSyncMessage, t]);
}
