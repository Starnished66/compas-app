import * as FileSystem from 'expo-file-system/legacy';
import { ArtworkDestinationError, type FileDownloader, type FileDownloadResult } from './HttpTransport';
import { nativeTransferError } from './nativeTransferError';
import { runPinSafeTask } from './pinSafeTask';
import { getPinSafeDownloads } from '../../modules/compas-files/src';

export interface FileDownloadProgress {
  received: number;
  total: number;
}

function isSuccess(status: number): boolean {
  return status >= 200 && status < 300;
}

async function takeErrorBody(fileUri: string): Promise<string> {
  try {
    return await FileSystem.readAsStringAsync(fileUri);
  } catch {
    return '';
  } finally {
    await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {});
  }
}

function mapDownloadError(error: unknown): Error {
  if ((error as { code?: string } | null)?.code === 'ERR_TRANSFER_DESTINATION') {
    return new ArtworkDestinationError(nativeTransferError(error).message);
  }
  return nativeTransferError(error);
}

function downloadWithNative(
  native: NonNullable<ReturnType<typeof getPinSafeDownloads>>,
  url: string,
  fileUri: string,
  headers: Record<string, string>,
  signal?: AbortSignal,
  onProgress?: (progress: FileDownloadProgress) => void,
  exclusive = false,
): Promise<FileDownloadResult> {
  return runPinSafeTask({
    prefix: 'download',
    cancelMessage: 'Download aborted',
    timeoutMessage: 'Download cancellation timed out',
    signal,
    cancelTransfer: (taskId) => native.cancelTransfer(taskId),
    addProgressListener: onProgress && typeof native.addListener === 'function'
      ? (taskId) => native.addListener!('onDownloadProgress', (event) => {
        if (event.taskId === taskId && !signal?.aborted) {
          onProgress({ received: event.received, total: event.total });
        }
      })
      : undefined,
    run: (taskId) => native.downloadFile(taskId, url, fileUri, headers, exclusive),
    mapError: mapDownloadError,
  });
}

export function pinSafeFileDownloader(): FileDownloader | undefined {
  const native = getPinSafeDownloads();
  if (typeof native?.downloadFile !== 'function') return undefined;
  return (url, fileUri, headers, signal) => downloadWithNative(native, url, fileUri, headers, signal);
}

export async function downloadToFile(
  url: string,
  fileUri: string,
  headers: Record<string, string>,
  signal?: AbortSignal,
  onProgress?: (progress: FileDownloadProgress) => void,
  /** Never replace an existing file: user downloads go to the next free name instead. */
  exclusive = false,
): Promise<FileDownloadResult> {
  if (signal?.aborted) throw new Error('Download aborted');
  const native = getPinSafeDownloads();
  if (typeof native?.downloadFile === 'function') {
    return downloadWithNative(native, url, fileUri, headers, signal, onProgress, exclusive);
  }
  // iOS defaults to a background URLSession, which is scheduled by the system and retries
  // unreachable hosts instead of failing, so short player requests stay in the foreground.
  const task = FileSystem.createDownloadResumable(
    url,
    fileUri,
    { headers, sessionType: FileSystem.FileSystemSessionType.FOREGROUND },
    onProgress
      ? (event) => {
        if (!signal?.aborted) {
          onProgress({ received: event.totalBytesWritten, total: event.totalBytesExpectedToWrite });
        }
      }
      : undefined,
  );
  const cancel = () => {
    task.cancelAsync().catch(() => {});
  };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    const result = await task.downloadAsync();
    if (!result || signal?.aborted) throw new Error('Download aborted');
    return {
      status: result.status,
      headers: result.headers,
      errorBody: isSuccess(result.status) ? '' : await takeErrorBody(fileUri),
    };
  } catch (error) {
    if (signal?.aborted) throw new Error('Download aborted');
    throw error;
  } finally {
    signal?.removeEventListener('abort', cancel);
  }
}
