import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { TransferSessionLease } from '../../session/transferSessionLeases';
import type { TransferApi } from '../screens/TransferScreen';

export interface TransferLeaseRunContext {
  transfer: TransferApi;
  signal: AbortSignal;
  isCurrent: () => boolean;
}

export interface TransferLeaseRunOptions {
  /** Whether to acquire a read-only transfer session lease before running the task. Default true. */
  acquireLease?: boolean;
  onError?: (cause: unknown) => void;
  onFinally?: () => void;
}

/**
 * Shared read-only transfer lease + AbortController + session/unmount ownership runner.
 * Used by screenshot capture/save so they never duplicate lease lifecycle logic
 * and never stop the player's Wi-Fi import session on release.
 */
export function useTransferLeaseRunner(
  transfer: TransferApi | undefined,
  sessionKey: string | null | undefined,
) {
  const aliveRef = useRef(true);
  const transferRef = useRef(transfer);
  transferRef.current = transfer;
  const sessionKeyRef = useRef(sessionKey);
  sessionKeyRef.current = sessionKey;
  const controllerRef = useRef<AbortController | null>(null);

  const abort = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  useEffect(() => {
    abort();
  }, [sessionKey, abort]);

  useEffect(() => () => {
    aliveRef.current = false;
    abort();
  }, [abort]);

  const run = useCallback(async (
    task: (ctx: TransferLeaseRunContext) => Promise<void>,
    options: TransferLeaseRunOptions = {},
  ) => {
    const activeTransfer = transferRef.current;
    if (!activeTransfer) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const capturedSessionKey = sessionKeyRef.current;
    let lease: TransferSessionLease | null = null;

    const isCurrent = () =>
      aliveRef.current &&
      !controller.signal.aborted &&
      controllerRef.current === controller &&
      sessionKeyRef.current === capturedSessionKey &&
      (!lease || lease.isActive());

    try {
      if (options.acquireLease !== false) {
        lease = await activeTransfer.acquire(controller.signal, { readOnly: true });
        if (!isCurrent()) return;
      }
      await task({ transfer: activeTransfer, signal: controller.signal, isCurrent });
    } catch (cause) {
      if (isCurrent()) options.onError?.(cause);
    } finally {
      if (lease) void lease.release().catch(() => {});
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        if (aliveRef.current) options.onFinally?.();
      }
    }
  }, []);

  return useMemo(() => ({ run, abort }), [run, abort]);
}
