import { nativeTransferError } from './nativeTransferError';

const CANCEL_SETTLE_TIMEOUT_MS = 5000;

export interface PinSafeTaskOptions<TResult> {
  prefix: 'upload' | 'download';
  cancelMessage: string;
  timeoutMessage: string;
  signal?: AbortSignal;
  cancelTransfer: (taskId: string) => void | Promise<void>;
  addProgressListener?: (taskId: string) => { remove(): void } | null;
  run: (taskId: string) => Promise<TResult>;
  mapError?: (error: unknown) => Error;
}

/** Runs a native CompasFiles transfer task with abort handling, bounded cancel timeout, and progress cleanup. */
export function runPinSafeTask<TResult>({
  prefix,
  cancelMessage,
  timeoutMessage,
  signal,
  cancelTransfer,
  addProgressListener,
  run,
  mapError = nativeTransferError,
}: PinSafeTaskOptions<TResult>): Promise<TResult> {
  return new Promise<TResult>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error(cancelMessage));
      return;
    }
    const taskId = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const progress = addProgressListener?.(taskId) ?? null;
    let cancelTimer: ReturnType<typeof setTimeout> | undefined;
    const cancel = () => {
      void Promise.resolve(cancelTransfer(taskId)).catch(() => {});
      cancelTimer = setTimeout(() => reject(new Error(timeoutMessage)), CANCEL_SETTLE_TIMEOUT_MS);
    };
    signal?.addEventListener('abort', cancel, { once: true });
    run(taskId).then(
      (result) => resolve(result),
      (error) => reject(signal?.aborted ? new Error(cancelMessage) : mapError(error)),
    ).finally(() => {
      if (cancelTimer) clearTimeout(cancelTimer);
      progress?.remove();
      signal?.removeEventListener('abort', cancel);
    });
  });
}
