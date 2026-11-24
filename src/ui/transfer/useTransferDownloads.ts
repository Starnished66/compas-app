import { useEffect, useRef, useState, type RefObject } from 'react';
import { createLocalDirectory, listLocalDirectory, localFileExists, localFileUri } from '../../../modules/compas-files/src';
import type { WifiImportFileEntry } from '../../data/types';
import type { useI18n } from '../../i18n';
import { planTransfer, type TransferPlan } from '../../session/transferPlan';
import { uniqueLocalPath } from '../../session/uniqueLocalPath';
import type { TransferApi } from '../screens/TransferScreen';
import { transferErrorText } from './transferErrorText';
import { collectSdFiles, MAX_COLLECTED_FILES, TooManyFilesError, type SdSource } from './collectSdFiles';
import { localizedCause } from './localizedNativeCause';

export { uniqueLocalPath };

type Translate = ReturnType<typeof useI18n>['t'];
type SetText = (message: string | null) => void;

const PROGRESS_INTERVAL_MS = 150;

export interface DownloadJob {
  fileIndex: number;
  fileCount: number;
  fileName: string;
  receivedBytes: number;
  totalBytes: number;
  destination: string;
}

export function useTransferDownloadState() {
  const [downloadJob, setDownloadJob] = useState<DownloadJob | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [choosingLocalDest, setChoosingLocalDest] = useState(false);
  const downloadControllerRef = useRef<AbortController | null>(null);
  /** File name each player file was saved under, per phone folder, so a retry knows its own renamed copies. */
  const savedNamesRef = useRef(new Map<string, string>());
  useEffect(() => () => downloadControllerRef.current?.abort(), []);
  return {
    downloadJob,
    setDownloadJob,
    preparing,
    setPreparing,
    downloading: preparing || downloadJob != null,
    choosingLocalDest,
    setChoosingLocalDest,
    downloadControllerRef,
    savedNamesRef,
  };
}

interface DownloadOptions {
  transferRef: RefObject<TransferApi>;
  aliveRef: RefObject<boolean>;
  connected: boolean;
  ready: boolean;
  sdSelected: Map<string, WifiImportFileEntry>;
  /** Whether the SD browser shows hidden files; folders are listed the same way. */
  showHidden: boolean;
  clearSdSelected: () => void;
  /** Drops entries that finished, so retrying a failed or cancelled batch fetches only what is missing. */
  deselectSd: (paths: readonly string[]) => void;
  setError: SetText;
  setNotice: SetText;
  onRefreshPhone?: () => void;
  t: Translate;
}

/** A phone folder could not be created; the message is already translated. */
class LocalFolderError extends Error {}

interface Progress {
  done: Set<string>;
  skipped: number;
}

async function createFolders(directories: TransferPlan['directories'], signal: AbortSignal, t: Translate) {
  for (const [parent, name] of directories) {
    if (signal.aborted) throw new Error('Download cancelled');
    try {
      await createLocalDirectory(parent, name);
    } catch (cause: unknown) {
      throw new LocalFolderError(localizedCause(cause, t('Could not create folder.'), t));
    }
  }
}

/** Remembers each phone folder's files once, so folder retries can skip what is already there. */
function localFileSizes() {
  const cache = new Map<string, Map<string, number>>();
  return async (folder: string) => {
    let sizes = cache.get(folder);
    if (!sizes) {
      sizes = new Map();
      try {
        for (const entry of await listLocalDirectory(folder, true)) if (!entry.isDirectory) sizes.set(entry.name, entry.size);
      } catch { /* an unreadable folder is treated as empty; the download reports real problems */ }
      cache.set(folder, sizes);
    }
    return sizes;
  };
}

/**
 * The file is there with the same size, under the name an earlier attempt saved it as, or under its own name
 * unless that name holds a copy saved for a different player file.
 */
function alreadyOnPhone(
  sizes: ReadonlyMap<string, number>, source: SdSource, destination: string, savedNames: ReadonlyMap<string, string>,
) {
  const key = `${source.path}\n${destination}`;
  const saved = savedNames.get(key);
  if (saved !== undefined && sizes.get(saved) === source.size) return true;
  if (sizes.get(source.name) !== source.size) return false;
  for (const [other, name] of savedNames) if (other !== key && name === source.name && other.endsWith(`\n${destination}`)) return false;
  return true;
}

/** Selected entries that finished completely: every file they cover is done. */
function completedRoots(sources: readonly SdSource[], done: ReadonlySet<string>): string[] {
  const roots = new Set(sources.map((source) => source.root));
  for (const source of sources) if (!done.has(source.path)) roots.delete(source.root);
  return [...roots];
}

export function createTransferDownload(
  state: ReturnType<typeof useTransferDownloadState>,
  options: DownloadOptions,
) {
  const { downloadControllerRef, downloading, setDownloadJob, setChoosingLocalDest, setPreparing, savedNamesRef } = state;
  const {
    transferRef, aliveRef, connected, ready, sdSelected, showHidden, clearSdSelected, deselectSd, setError, setNotice,
    onRefreshPhone, t,
  } = options;

  const downloadPlanned = async (plan: TransferPlan<SdSource>, destinationFolder: string, controller: AbortController, progress: Progress) => {
    const sizesIn = localFileSizes();
    const files = plan.uploads;
    let doneBytes = 0;
    let lastProgressAt = 0;
    for (let i = 0; i < files.length; i++) {
      if (controller.signal.aborted) throw new Error('Download cancelled');
      const { source, destination } = files[i];
      const base = {
        fileIndex: i + 1,
        fileCount: files.length,
        fileName: source.name,
        totalBytes: plan.totalBytes,
        destination: destinationFolder,
      };
      if (aliveRef.current) setDownloadJob({ ...base, receivedBytes: doneBytes });
      // Files reached through a folder can't be deselected one by one, so a retry skips what is already there.
      if (source.relativeDir && alreadyOnPhone(await sizesIn(destination), source, destination, savedNamesRef.current)) {
        progress.skipped++;
      } else {
        const target = uniqueLocalPath(destination, source.name, localFileExists);
        const savedPath = await transferRef.current.download(
          source.path,
          localFileUri(target),
          (received) => {
            const now = Date.now();
            if (!aliveRef.current || now - lastProgressAt < PROGRESS_INTERVAL_MS) return;
            lastProgressAt = now;
            setDownloadJob({ ...base, receivedBytes: doneBytes + received });
          },
          controller.signal,
        );
        const written = savedPath || target;
        savedNamesRef.current.set(`${source.path}\n${destination}`, written.slice(written.lastIndexOf('/') + 1));
      }
      doneBytes += source.size;
      progress.done.add(source.path);
    }
  };

  const reportFailure = (cause: any, controller: AbortController) => {
    if (controller.signal.aborted) {
      setNotice(t('Download cancelled.'));
    } else if (cause instanceof TooManyFilesError) {
      setError(t('Choose fewer than {count} files at once', { count: MAX_COLLECTED_FILES }));
    } else if (cause instanceof LocalFolderError) {
      setError(cause.message);
    } else {
      setError(transferErrorText(cause, 'Download failed.', t));
    }
  };

  return async (destinationFolder: string) => {
    if (downloadControllerRef.current || downloading || !ready || !connected || sdSelected.size === 0) return;
    setChoosingLocalDest(false);

    const controller = new AbortController();
    downloadControllerRef.current = controller;
    setError(null);
    setNotice(null);
    setPreparing(true);

    const progress: Progress = { done: new Set(), skipped: 0 };
    let sources: SdSource[] = [];

    try {
      const list = (path: string, offset: number, hidden?: boolean) => transferRef.current.list(path, offset, hidden);
      const collected = await collectSdFiles([...sdSelected.values()], list, showHidden, controller.signal);
      sources = collected.files;
      const plan = planTransfer(sources, destinationFolder, collected.folders);
      await createFolders(plan.directories, controller.signal, t);
      if (!aliveRef.current) return;
      setPreparing(false);
      await downloadPlanned(plan, destinationFolder, controller, progress);
      if (!aliveRef.current) return;
      clearSdSelected();
      setNotice([
        t('Download complete.'),
        progress.skipped ? t('{count} already on this phone.', { count: progress.skipped }) : '',
      ].filter(Boolean).join(' '));
      onRefreshPhone?.();
    } catch (cause: any) {
      if (!aliveRef.current) return;
      reportFailure(cause, controller);
      const finished = completedRoots(sources, progress.done);
      if (progress.done.size > 0) {
        deselectSd(finished);
        onRefreshPhone?.();
      }
    } finally {
      if (downloadControllerRef.current === controller) downloadControllerRef.current = null;
      if (aliveRef.current) {
        setPreparing(false);
        setDownloadJob(null);
      }
    }
  };
}
