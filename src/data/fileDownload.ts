import * as FileSystem from 'expo-file-system/legacy';
import type { FileDownloadResult } from './HttpTransport';
import { nativeTransferError } from './nativeTransferError';
import { getPinSafeTransfers } from '../../modules/compas-files/src';

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

export async function downloadToFile(
  url: string,
  fileUri: string,
  headers: Record<string, string>,
  signal: AbortSignal
): Promise<FileDownloadResult> {
  if (signal.aborted) throw new Error('Download aborted');
  const native = getPinSafeTransfers();
  if (native) {
    const taskId = `download-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const cancelNative = () => native.cancelTransfer(taskId);
    signal.addEventListener('abort', cancelNative);
    try {
      return await native.downloadFile(taskId, url, fileUri, headers);
    } catch (error) {
      throw nativeTransferError(error);
    } finally {
      signal.removeEventListener('abort', cancelNative);
    }
  }
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
