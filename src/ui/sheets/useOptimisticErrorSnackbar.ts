import { useCallback, useEffect, useRef } from 'react';
import { useSnackbar } from '../snackbar/useSnackbar';
import { useI18n } from '../../i18n';

interface ErrorWatch {
  messageAtStart: string | null;
  until: number;
}

const ERROR_WATCH_MS = 15000;

export function useOptimisticErrorSnackbar(errorMessage: string | null | undefined) {
  const { t } = useI18n();
  const snackbar = useSnackbar();
  const watchRef = useRef<ErrorWatch | null>(null);
  const messageRef = useRef(errorMessage ?? null);
  messageRef.current = errorMessage ?? null;

  useEffect(() => {
    const watch = watchRef.current;
    if (!watch || !errorMessage || errorMessage === watch.messageAtStart) return;
    watchRef.current = null;
    if (Date.now() <= watch.until) snackbar.show({ text: t(errorMessage) });
  }, [errorMessage, snackbar, t]);

  return useCallback(() => {
    watchRef.current = { messageAtStart: messageRef.current, until: Date.now() + ERROR_WATCH_MS };
  }, []);
}
