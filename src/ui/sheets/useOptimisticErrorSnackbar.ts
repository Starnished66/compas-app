import { useCallback, useEffect, useRef } from 'react';
import { useSnackbar } from '../snackbar/useSnackbar';
import { SnackbarMessage } from '../snackbar/snackbarContext';
import { useI18n } from '../../i18n';
import { localizedMessage } from '../localizedLabels';

/** Success shown only once `confirmed` accepts a later confirmation signal from the player. */
export interface ConfirmedSuccess<S> {
  message: SnackbarMessage;
  confirmed: (signal: S) => boolean;
}

interface ErrorWatch<S> {
  messageAtStart: string | null;
  until: number;
  success: ConfirmedSuccess<S> | null;
}

const ERROR_WATCH_MS = 15000;

const NO_CONFIRMATION_MESSAGE = 'No response from the player. Check whether the change was applied.';

/**
 * Watches for the player's verdict after an action: a new error message is shown as soon as it
 * appears, and an optional success message waits for `confirmationSignal` to satisfy its predicate,
 * so success and failure never both appear. A success that is never confirmed reports the timeout.
 */
export function useOptimisticErrorSnackbar<S = undefined>(errorMessage: string | null | undefined, confirmationSignal?: S) {
  const { t } = useI18n();
  const snackbar = useSnackbar();
  const watchRef = useRef<ErrorWatch<S> | null>(null);
  const messageRef = useRef(errorMessage ?? null);
  messageRef.current = errorMessage ?? null;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ snackbar, t });
  latest.current = { snackbar, t };

  const finish = useCallback(() => {
    watchRef.current = null;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);
  useEffect(() => finish, [finish]);

  useEffect(() => {
    const watch = watchRef.current;
    if (!watch || !errorMessage || errorMessage === watch.messageAtStart) return;
    finish();
    if (Date.now() <= watch.until) snackbar.show({ text: localizedMessage(errorMessage, t) });
  }, [errorMessage, finish, snackbar, t]);

  useEffect(() => {
    const success = watchRef.current?.success;
    if (!success || !success.confirmed(confirmationSignal as S)) return;
    finish();
    snackbar.show(success.message);
  }, [confirmationSignal, finish, snackbar]);

  return useCallback((success?: ConfirmedSuccess<S>) => {
    finish();
    watchRef.current = { messageAtStart: messageRef.current, until: Date.now() + ERROR_WATCH_MS, success: success ?? null };
    if (!success) return;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (watchRef.current?.success !== success) return;
      watchRef.current = null;
      latest.current.snackbar.show({ text: latest.current.t(NO_CONFIRMATION_MESSAGE) });
    }, ERROR_WATCH_MS);
  }, [finish]);
}
