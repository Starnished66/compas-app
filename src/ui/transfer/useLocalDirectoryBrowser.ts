import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createLocalDirectory,
  getStorageRoots,
  listLocalDirectory,
  type LocalFileEntry,
  type StorageRoot,
} from '../../../modules/compas-files/src';
import type { useI18n } from '../../i18n';
import { localizedCause } from './localizedNativeCause';
import { useRequestGuard } from '../useRequestGuard';

type Translate = ReturnType<typeof useI18n>['t'];

export interface LocalDirectoryBrowserOptions {
  enabled?: boolean;
  initialPath?: string;
  directoriesOnly?: boolean;
  showHidden?: boolean;
  fallbackError?: string;
  onError?: (message: string | null) => void;
  t: Translate;
}

export function storageRootLabel(item: StorageRoot, t: Translate): string {
  // The native module names the primary volume in English; other volumes use the system's own label.
  return item.name === 'Internal storage' ? t('Internal storage') : item.name;
}

export function localDirectoryDisplay(path: string, root: StorageRoot | null, t: Translate) {
  const relative = path && root ? path.slice(root.path.length).replace(/^\//, '') : '';
  const parent = path && root && path !== root.path ? path.slice(0, path.lastIndexOf('/')) : null;
  const label = relative ? `/${relative}` : root ? storageRootLabel(root, t) : '';
  return { relative, parent, label };
}

function resolveInitialTarget(found: readonly StorageRoot[], initialPath: string) {
  const matched = found.find((r) => initialPath && (initialPath === r.path || initialPath.startsWith(`${r.path}/`))) ?? found[0] ?? null;
  const startPath = initialPath && matched ? initialPath : matched?.path ?? '';
  return { matched, startPath };
}

export function useLocalDirectoryBrowser({
  enabled = true,
  initialPath = '',
  directoriesOnly = false,
  showHidden = false,
  fallbackError,
  onError,
  t,
}: LocalDirectoryBrowserOptions) {
  const requests = useRequestGuard();
  const [roots, setRoots] = useState<StorageRoot[]>([]);
  const [root, setRoot] = useState<StorageRoot | null>(null);
  const [path, setPath] = useState(initialPath);
  const [entries, setEntries] = useState<LocalFileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setLocalError] = useState<string | null>(null);
  const showHiddenRef = useRef(showHidden);
  showHiddenRef.current = showHidden;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const pathRef = useRef(path);
  pathRef.current = path;
  const loadingRef = useRef(false);
  const defaultError = fallbackError ?? t('Could not open this folder.');

  const reportError = useCallback((message: string | null) => {
    setLocalError(message);
    onErrorRef.current?.(message);
  }, []);

  const stopLoading = useCallback(() => {
    loadingRef.current = false;
    setLoading(false);
  }, []);

  /** `quiet` reloads without touching errors: a background refresh must not hide another task's message. */
  const loadDirectory = useCallback(async (target: string, hiddenOverride?: boolean, quiet = false) => {
    const isCurrent = requests.next();
    loadingRef.current = true;
    setLoading(true);
    if (!quiet) reportError(null);
    try {
      const listed = await listLocalDirectory(target, hiddenOverride ?? showHiddenRef.current);
      if (!isCurrent()) return;
      setPath(target);
      setEntries(directoriesOnly ? listed.filter((entry) => entry.isDirectory) : listed);
    } catch (cause: unknown) {
      if (isCurrent() && !quiet) reportError(localizedCause(cause, defaultError, t));
    } finally {
      if (isCurrent()) stopLoading();
    }
  }, [directoriesOnly, defaultError, reportError, requests, stopLoading, t]);

  /** Shows the current folder's latest contents; a folder already loading will be fresh anyway. */
  const refresh = useCallback(() => {
    if (loadingRef.current || !pathRef.current) return;
    void loadDirectory(pathRef.current, undefined, true);
  }, [loadDirectory]);

  useEffect(() => {
    requests.invalidate();
    if (!enabled) { stopLoading(); return; }
    reportError(null);
    setPath('');
    setEntries([]);
    try {
      const found = getStorageRoots();
      setRoots(found);
      const { matched, startPath } = resolveInitialTarget(found, initialPath);
      setRoot(matched);
      if (startPath) void loadDirectory(startPath);
      else stopLoading();
    } catch (cause: unknown) {
      stopLoading();
      reportError(localizedCause(cause, defaultError, t));
    }
    return () => { requests.invalidate(); };
  }, [enabled, initialPath, loadDirectory, reportError, requests, defaultError, stopLoading, t]);

  const selectRoot = useCallback((nextPath: string) => {
    const next = roots.find((item) => item.path === nextPath) ?? null;
    requests.invalidate();
    setRoot(next);
    reportError(null);
    setPath('');
    setEntries([]);
    if (next) void loadDirectory(next.path);
    else stopLoading();
  }, [loadDirectory, reportError, requests, roots, stopLoading]);

  const createFolder = useCallback(async (name: string): Promise<boolean> => {
    const trimmed = name.trim();
    if (!trimmed || !path || loading) return false;
    const isCurrent = requests.next();
    loadingRef.current = true;
    setLoading(true);
    reportError(null);
    try {
      const created = await createLocalDirectory(path, trimmed);
      if (!isCurrent()) return false;
      await loadDirectory(created);
      return true;
    } catch (cause: unknown) {
      if (isCurrent()) {
        reportError(localizedCause(cause, t('Could not create folder.'), t));
        stopLoading();
      }
      return false;
    }
  }, [loadDirectory, loading, path, reportError, requests, stopLoading, t]);

  const display = localDirectoryDisplay(path, root, t);
  return {
    roots, root, path, entries, setEntries, loading, error,
    parentPath: display.parent, displayPath: display.label,
    loadDirectory, refresh, selectRoot, createFolder,
  };
}
