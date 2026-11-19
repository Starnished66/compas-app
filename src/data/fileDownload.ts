import * as FileSystem from 'expo-file-system/legacy';
import { ArtworkDestinationError, type FileDownloader, type FileDownloadResult } from './HttpTransport';
import { nativeTransferError } from './nativeTransferError';
import { getPinSafeDownloads } from '../../modules/compas-files/src';

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

export function pinSafeFileDownloader(): FileDownloader | undefined {
  const native = getPinSafeDownloads();
  if (typeof native?.downloadFile !== 'function') return undefined;
  return async (url, fileUri, headers, signal) => {
    if (signal.aborted) throw new Error('Download aborted');
    const taskId = `download-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const cancelNative = () => { void Promise.resolve(native.cancelTransfer(taskId)).catch(() => {}); };
    signal.addEventListener('abort', cancelNative);
    try {
      return await native.downloadFile(taskId, url, fileUri, headers);
    } catch (error) {
      if ((error as { code?: string } | null)?.code === 'ERR_TRANSFER_DESTINATION') {
        throw new ArtworkDestinationError(nativeTransferError(error).message);
      }
      throw nativeTransferError(error);
    } finally {
      signal.removeEventListener('abort', cancelNative);
    }
  };
}

export async function downloadToFile(
  url: string,
  fileUri: string,
  headers: Record<string, string>,
  signal: AbortSignal
): Promise<FileDownloadResult> {
  if (signal.aborted) throw new Error('Download aborted');
  const pinSafe = pinSafeFileDownloader();
  if (pinSafe) return pinSafe(url, fileUri, headers, signal);
  // iOS defaults to a background URLSession, which is scheduled by the system and retries
  // unreachable hosts instead of failing, so short player requests stay in the foreground.
  const task = FileSystem.createDownloadResumable(url, fileUri, {
    headers,
    sessionType: FileSystem.FileSystemSessionType.FOREGROUND,
  });
  const cancel = () => {
    task.cancelAsync().catch(() => {});
  };
  signal.addEventListener('abort', cancel);
  try {
    const result = await task.downloadAsync();
    if (!result || signal.aborted) throw new Error('Download aborted');
    return {
      status: result.status,
      headers: result.headers,
      errorBody: isSuccess(result.status) ? '' : await takeErrorBody(fileUri),
    };
  } finally {
    signal.removeEventListener('abort', cancel);
  }
}
