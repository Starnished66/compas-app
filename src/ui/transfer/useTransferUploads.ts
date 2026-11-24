import { useEffect, useRef, useState, type RefObject, type Dispatch, type SetStateAction } from 'react';
import { collectLocalFiles, type LocalFileEntry } from '../../../modules/compas-files/src';
import { planTransfer } from '../../session/transferPlan';
import type { TransferSessionLease } from '../../session/transferSessionLeases';
import { localizedMessage } from '../localizedLabels';
import { sendFiles } from './transferFileUploads';
import type { useSdBrowser } from './useSdBrowser';

import type { TransferApi } from '../screens/TransferScreen';
import type { useI18n } from '../../i18n';

type Translate = ReturnType<typeof useI18n>['t'];
type SetError = (message: string | null) => void;

const MAX_FILE_BYTES = 4 * 1024 * 1024 * 1024 - 1;
export interface UploadJob {
  fileIndex: number;
  fileCount: number;
  fileName: string;
  sentBytes: number;
  totalBytes: number;
  destination: string;
  /** Waiting for the player to take the file again after a dropped link. */
  waiting?: boolean;
}

export type TransferPane = 'phone' | 'sd';

export function useTransferUploadState() {
  const [finishing, setFinishing] = useState(false);
  const [job, setJob] = useState<UploadJob | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [uploadedSinceFinish, setUploadedSinceFinish] = useState(0);
  const uploadControllerRef = useRef<AbortController | null>(null);
  useEffect(() => () => uploadControllerRef.current?.abort(), []);

  const uploading = preparing || job != null;
  return { finishing, setFinishing, job, setJob, uploading, setPreparing, uploadedSinceFinish, setUploadedSinceFinish, uploadControllerRef };
}

type UploadState = ReturnType<typeof useTransferUploadState>;

interface UploadOptions {
  transferRef: RefObject<TransferApi>;
  aliveRef: RefObject<boolean>;
  connected: boolean;
  ready: boolean;
  selected: Map<string, LocalFileEntry>;
  phoneHiddenRef: RefObject<boolean>;
  setChoosingDestination: (value: boolean) => void;
  setSelected: Dispatch<SetStateAction<Map<string, LocalFileEntry>>>;
  setError: SetError;
  setNotice: SetError;
  setPane: (pane: TransferPane) => void;
  t: Translate;
  loadSd: ReturnType<typeof useSdBrowser>['load'];
  reopenPathRef: RefObject<string | null>;
}

export function createTransferUpload(state: UploadState, options: UploadOptions) {
  const { uploadControllerRef, uploading, setPreparing, setJob, setUploadedSinceFinish } = state;
  const { connected, ready, selected, setChoosingDestination, transferRef, setError, setNotice, phoneHiddenRef,
    aliveRef, setSelected, setPane, loadSd, reopenPathRef, t } = options;
  return async (destination: string) => {
    if (uploadControllerRef.current || uploading || !ready || !connected || selected.size === 0) return;
    setChoosingDestination(false);
    const controller = new AbortController();
    uploadControllerRef.current = controller;
    const api = transferRef.current;
    setError(null);
    setNotice(null);
    setPreparing(true);
    const result = { uploaded: 0, skipped: 0, failed: [] as string[] };
    try {
      const collected = await collectLocalFiles([...selected.keys()], phoneHiddenRef.current);
      const tooLarge = collected.filter((file) => file.size > MAX_FILE_BYTES);
      result.failed.push(...tooLarge.map((file) => file.name));
      const plan = planTransfer(collected.filter((file) => file.size <= MAX_FILE_BYTES), destination);
      for (const [parent, name] of plan.directories) {
        if (controller.signal.aborted) throw new Error('Upload cancelled');
        await api.mkdir(parent, name);
      }
      if (!aliveRef.current) return;
      setPreparing(false);
      await sendFiles(plan, destination, controller, result, { transferRef, aliveRef, setJob });
      if (!aliveRef.current) return;
      setSelected(new Map());
      setNotice([
        t('{count} files uploaded.', { count: result.uploaded }),
        result.skipped ? t('{count} already on the SD card.', { count: result.skipped }) : '',
      ].filter(Boolean).join(' '));
      if (result.failed.length) setError(t('Could not upload: {files}', { files: result.failed.join(', ') }));
    } catch (cause: any) {
      if (!aliveRef.current) return;
      if (controller.signal.aborted) setNotice(t('Upload cancelled. {count} files uploaded.', { count: result.uploaded }));
      else {
        const summary = t('Upload stopped after {count} files. You can retry the remaining files.', { count: result.uploaded });
        setError(cause?.message ? `${summary} ${localizedMessage(cause.message, t)}` : summary);
      }
    } finally {
      if (uploadControllerRef.current === controller) uploadControllerRef.current = null;
      if (aliveRef.current) {
        setPreparing(false);
        setJob(null);
        if (result.uploaded) setUploadedSinceFinish((count) => count + result.uploaded);
        setPane('sd');
        if (transferRef.current.status.state === 'ready') void loadSd(destination);
        else reopenPathRef.current = destination;
      }
    }
  };
}

export function createFinishImport(
  state: UploadState,
  { transferRef, aliveRef, setError, setNotice, t }: Pick<UploadOptions, 'transferRef' | 'aliveRef' | 'setError' | 'setNotice' | 't'>,
  wantSessionRef: RefObject<boolean>,
  leaseRef: RefObject<TransferSessionLease | null>,
  errorText: (cause: unknown, fallback: string) => string,
) {
  const { uploading, finishing, setFinishing, uploadedSinceFinish, setUploadedSinceFinish } = state;
  const finish = async () => {
    if (uploading || finishing) return;
    const hadUploads = uploadedSinceFinish > 0;
    setFinishing(true);
    setError(null);
    try {
      const lease = leaseRef.current;
      leaseRef.current = null;
      if (lease) {
        await lease.release({ stopIfIdle: true });
      } else {
        await transferRef.current.finish();
      }
      wantSessionRef.current = false;
      if (hadUploads) {
        await transferRef.current.refreshAfterUpload();
      }
      if (!aliveRef.current) return;
      setUploadedSinceFinish(0);
      setNotice(t('The player is updating its library.'));
    } catch (cause: any) {
      if (aliveRef.current) setError(errorText(cause, t('Could not finish import.')));
    } finally {
      if (aliveRef.current) setFinishing(false);
    }
  };

  return finish;
}
