import * as FileSystem from 'expo-file-system/legacy';
import { nativeTransferError } from './nativeTransferError';
import { getPinSafeTransfers } from '../../modules/compas-files/src';

export interface NativeUploadProgress {
  sent: number;
  total: number;
}

export interface NativeUploadResponse {
  status: number;
  body: string;
}

const CANCEL_SETTLE_TIMEOUT_MS = 5000;

/** Streams a local file from native storage as the raw HTTP request body. */
export function uploadFileNative(
  url: string,
  fileUri: string,
  headers: Record<string, string>,
  onProgress: (progress: NativeUploadProgress) => void,
  signal?: AbortSignal,
): Promise<NativeUploadResponse> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Upload cancelled'));
      return;
    }

    const native = getPinSafeTransfers();
    if (native) {
      const taskId = `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const progress = native.addListener('onUploadProgress', (event) => {
        if (event.taskId === taskId && !signal?.aborted) onProgress({ sent: event.sent, total: event.total });
      });
      let cancelTimer: ReturnType<typeof setTimeout> | undefined;
      const cancel = () => {
        native.cancelTransfer(taskId);
        // The old path rejected within this window even if the native task never settled.
        cancelTimer = setTimeout(() => reject(new Error('Upload cancellation timed out')), CANCEL_SETTLE_TIMEOUT_MS);
      };
      signal?.addEventListener('abort', cancel, { once: true });
      native.uploadFile(taskId, url, fileUri, headers).then(
        (result) => resolve({ status: result.status, body: result.body }),
        (error) => reject(signal?.aborted ? new Error('Upload cancelled') : nativeTransferError(error)),
      ).finally(() => {
        if (cancelTimer) clearTimeout(cancelTimer);
        progress.remove();
        signal?.removeEventListener('abort', cancel);
      });
      return;
    }

    let settled = false;
    let cancelTimer: ReturnType<typeof setTimeout> | undefined;
    let cancelStarted = false;
    let rejectCancellation!: (error: Error) => void;
    const cancellationPromise = new Promise<never>((_resolve, cancelReject) => { rejectCancellation = cancelReject; });
    let removeAbortListener = () => {};
    const settle = (complete: () => void) => {
      if (settled) return;
      settled = true;
      if (cancelTimer) clearTimeout(cancelTimer);
      removeAbortListener();
      complete();
    };

    let task: ReturnType<typeof FileSystem.createUploadTask>;
    try {
      task = FileSystem.createUploadTask(
        url,
        fileUri,
        {
          httpMethod: 'POST',
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          headers,
        },
        (event) => {
          if (!settled && !signal?.aborted) onProgress({ sent: event.totalBytesSent, total: event.totalBytesExpectedToSend });
        },
      );
    } catch (error) {
      reject(error);
      return;
    }

    const uploadPromise = (() => {
      try { return task.uploadAsync(); }
      catch (error) { return Promise.reject(error); }
    })();

    const abort = () => {
      if (cancelStarted || settled) return;
      cancelStarted = true;
      cancelTimer = setTimeout(() => rejectCancellation(new Error('Upload cancellation timed out')), CANCEL_SETTLE_TIMEOUT_MS);
      Promise.resolve().then(() => task.cancelAsync()).then(
        () => rejectCancellation(new Error('Upload cancelled')),
        (error) => rejectCancellation(error),
      );
    };
    if (signal) {
      signal.addEventListener('abort', abort, { once: true });
      removeAbortListener = () => signal.removeEventListener('abort', abort);
      if (signal.aborted) abort();
    }

    const observedUpload = uploadPromise.then(
      (result) => result,
      (error) => {
        if (signal?.aborted) return cancellationPromise;
        throw error;
      },
    );
    Promise.race([observedUpload, cancellationPromise]).then(
      (result) => {
        if (!result) {
          settle(() => reject(new Error('Upload did not return a response')));
        } else {
          settle(() => resolve({ status: result.status, body: result.body }));
        }
      },
      (error) => settle(() => reject(error)),
    );
  });
}
