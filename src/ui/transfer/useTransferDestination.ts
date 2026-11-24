import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Alert } from 'react-native';
import type { WifiImportFileEntry } from '../../data/types';
import { isTransferUnavailable } from '../../session/transferAvailability';
import type { TransferSessionLease } from '../../session/transferSessionLeases';
import { useSdBrowser } from './useSdBrowser';
import type { TransferApi } from '../screens/TransferScreen';
import type { useI18n } from '../../i18n';

type Translate = ReturnType<typeof useI18n>['t'];
type SetError = (message: string | null) => void;


export function useTransferDestination(transfer: TransferApi, setError: SetError, t: Translate) {
  const sd = useSdBrowser(transfer, '', (cause) => { if (isTransferUnavailable(cause)) destinationUnavailable(); });
  const [choosingDestination, setChoosingDestination] = useState(false);
  const destinationUnavailable = useCallback(() => {
    sd.reset();
    setChoosingDestination(false);
    setError(t('The player SD card is unavailable'));
  }, [sd.reset, t]);

  const [starting, setStarting] = useState(false);
  return { sd, choosingDestination, setChoosingDestination, destinationUnavailable, starting, setStarting };
}

interface SessionOptions {
  connected: boolean;
  active: boolean;
  status: TransferApi['status']['state'];
  transferRef: RefObject<TransferApi>;
  aliveRef: RefObject<boolean>;
  uploadControllerRef: RefObject<AbortController | null>;
  setError: SetError;
  errorText: (cause: unknown, fallback: string) => string;
  t: Translate;
}

export function useTransferSession(destination: ReturnType<typeof useTransferDestination>, options: SessionOptions) {
  const { sd, starting, setStarting } = destination;
  const { path: sdPath, load: loadSd } = sd;
  const { connected, active, status, transferRef, aliveRef, uploadControllerRef, setError, errorText, t } = options;
  // Set once the import session opens and cleared by Finish, so a reconnect reopens it.
  const wantSessionRef = useRef(false);
  const leaseRef = useRef<TransferSessionLease | null>(null);
  const mountedRef = useRef(true);
  const acquireControllerRef = useRef<AbortController | null>(null);
  const sdPathRef = useRef('');
  sdPathRef.current = sdPath;
  // An upload that ended offline shows its destination once the session reopens.
  const reopenPathRef = useRef<string | null>(null);
  useEffect(() => () => {
    mountedRef.current = false;
    acquireControllerRef.current?.abort();
    acquireControllerRef.current = null;
    const lease = leaseRef.current;
    leaseRef.current = null;
    if (lease) void lease.release().catch(() => {});
  }, []);
  const startSession = useCallback(async (requested = '') => {
    acquireControllerRef.current?.abort();
    const controller = new AbortController();
    acquireControllerRef.current = controller;
    const ownsStart = () =>
      mountedRef.current &&
      aliveRef.current &&
      !controller.signal.aborted &&
      acquireControllerRef.current === controller;
    setStarting(true);
    setError(null);
    try {
      if (!leaseRef.current?.isActive()) {
        const acquired = await transferRef.current.acquire(controller.signal);
        if (!ownsStart()) {
          void acquired.release().catch(() => {});
          return;
        }
        const previous = leaseRef.current;
        leaseRef.current = acquired;
        if (previous && previous !== acquired) {
          void previous.release().catch(() => {});
        }
      }
      if (!ownsStart()) return;
      wantSessionRef.current = true;
      // Read after start: an upload may have ended while it was pending.
      const path = reopenPathRef.current ?? requested;
      reopenPathRef.current = null;
      if (ownsStart() && !uploadControllerRef.current) await loadSd(path);
    } catch (cause: any) {
      if (ownsStart()) setError(errorText(cause, t('Could not start Wi-Fi import.')));
    } finally {
      if (acquireControllerRef.current === controller) {
        acquireControllerRef.current = null;
        if (mountedRef.current && aliveRef.current) setStarting(false);
      }
    }
  }, [errorText, loadSd, t]);

  // Reconnecting resets the player's import session; reopen it where the SD card was showing.
  useEffect(() => {
    if (connected && status === 'stopped' && wantSessionRef.current && !starting) void startSession(sdPathRef.current);
  }, [connected, status, starting, startSession]);

  // Open the player's import session the first time the tab is shown.
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (!active || autoStartedRef.current) return;
    autoStartedRef.current = true;
    void startSession();
  }, [active, startSession]);

  useEffect(() => {
    if (status === 'stopped' || status === 'error') sd.reset();
  }, [status, sd.reset]);

  return { wantSessionRef, reopenPathRef, leaseRef, startSession };
}

export function createSdEntryActions(
  sd: ReturnType<typeof useSdBrowser>, uploading: boolean, transferRef: RefObject<TransferApi>, setError: SetError, t: Translate,
) {
  const { setEditing, setEditValue } = sd;
  const sdEntryActions = (entry: WifiImportFileEntry) => {
    if (uploading) return;
    Alert.alert(entry.name, undefined, [
      { text: t('Rename'), onPress: () => { setEditing({ kind: 'rename', entry }); setEditValue(entry.name); } },
      { text: t('Delete'), style: 'destructive', onPress: () => confirmDelete(entry) },
      { text: t('Cancel'), style: 'cancel' },
    ]);
  };

  const confirmDelete = (entry: WifiImportFileEntry) => {
    Alert.alert(t('Delete file?'), t('Delete {name} from the SD card?', { name: entry.name }), [
      { text: t('Cancel'), style: 'cancel' },
      { text: t('Delete'), style: 'destructive', onPress: () => {
        setError(null);
        void sd.mutate(() => transferRef.current.remove(entry.path));
      } },
    ]);
  };

  return sdEntryActions;
}
