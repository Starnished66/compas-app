import type { RefObject } from 'react';
import { localFileUri } from '../../../modules/compas-files/src';
import type { planTransfer } from '../../session/transferPlan';
import { isConnectionError } from '../../session/transferAvailability';
import type { TransferApi } from '../screens/TransferScreen';
import type { UploadJob } from './useTransferUploads';

const PROGRESS_INTERVAL_MS = 150;
// A dropped Wi-Fi link reconnects on its own, but the player keeps refusing uploads for about a
// minute while the interrupted one times out; an upload keeps retrying that long before giving up.
const RECONNECT_WAIT_MS = 120000;
const UPLOAD_RETRY_DELAY_MS = 3000;

interface FileUploadCallbacks {
  transferRef: RefObject<TransferApi>;
  aliveRef: RefObject<boolean>;
  setJob: (job: UploadJob) => void;
}

export async function sendFiles(
  plan: ReturnType<typeof planTransfer>, destination: string, controller: AbortController,
  result: UploadResult, { transferRef, aliveRef, setJob }: FileUploadCallbacks,
) {
  let doneBytes = 0;
  let lastProgressAt = 0;
  let offlineSince: number | null = null;
  for (let index = 0; index < plan.uploads.length; index++) {
    if (controller.signal.aborted) throw new Error('Upload cancelled');
    const { source, destination: folder } = plan.uploads[index];
    const base = { fileIndex: index + 1, fileCount: plan.uploads.length, fileName: source.name, totalBytes: plan.totalBytes, destination };
    if (aliveRef.current) setJob({ ...base, sentBytes: doneBytes });
    try {
      await transferRef.current.upload(localFileUri(source.path), folder, source.name, (sent) => {
        const now = Date.now();
        if (!aliveRef.current || now - lastProgressAt < PROGRESS_INTERVAL_MS) return;
        lastProgressAt = now;
        setJob({ ...base, sentBytes: doneBytes + sent });
      }, controller.signal);
      result.uploaded++;
      offlineSince = null;
    } catch (cause: any) {
      if (controller.signal.aborted) throw cause;
      // The player drops a partial file, so the same file is sent again once the link is back.
      if (isConnectionError(cause)) {
        offlineSince ??= Date.now();
        const deadline = offlineSince + RECONNECT_WAIT_MS;
        if (Date.now() < deadline) {
          if (aliveRef.current) setJob({ ...base, sentBytes: doneBytes, waiting: true });
          await waitForSession(transferRef, aliveRef, controller.signal, deadline);
          index--;
          continue;
        }
      }
      const code = cause?.statusCode;
      if (code === 409) result.skipped++;
      else if (code === 400 || code === 404 || code === 413 || cause?.message === 'Enter a valid file name') result.failed.push(source.name);
      else throw cause;
    }
    doneBytes += source.size;
  }
}

interface UploadResult {
  uploaded: number;
  skipped: number;
  failed: string[];
}

async function waitForSession(transferRef: FileUploadCallbacks['transferRef'], aliveRef: FileUploadCallbacks['aliveRef'], signal: AbortSignal, deadline: number) {
  await new Promise((resolve) => setTimeout(resolve, UPLOAD_RETRY_DELAY_MS));
  while (transferRef.current.status.state !== 'ready') {
    if (signal.aborted) throw new Error('Upload cancelled');
    if (!aliveRef.current || Date.now() > deadline) throw new Error('Connection to Compás player was lost.');
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (signal.aborted) throw new Error('Upload cancelled');
}
