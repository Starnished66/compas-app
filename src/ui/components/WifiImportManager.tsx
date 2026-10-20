import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { ConnectionTransport, WifiImportDirectoryPage, WifiImportFileEntry, WifiImportStatus } from '../../data/types';
import { useI18n } from '../../i18n';
import { usePalette } from '../PaletteProvider';
import { AppText } from './AppText';
import { Button } from './Button';
import { Divider } from './Divider';
import { Icon } from './Icon';
import { InlineError } from './InlineError';
import { ListRow } from './ListRow';
import { Spinner } from './Spinner';
import { TextField } from './TextField';
import { Space } from '../tokens';

type PickedFile = { uri: string; name: string; size?: number };
type Progress = { fileIndex: number; fileCount: number; sent: number; total: number };

export interface WifiImportManagerProps {
  transport: ConnectionTransport;
  supported: boolean;
  status: WifiImportStatus;
  onEnsureReady: () => Promise<void>;
  onFinish: () => Promise<void>;
  onFinished: () => void;
  onCancel: () => void;
  onStartUpgrade: () => Promise<void>;
  onList: (path: string, offset: number) => Promise<WifiImportDirectoryPage>;
  onUpload: (uri: string, path: string, name: string, onProgress: (sent: number, total: number) => void, signal: AbortSignal) => Promise<void>;
  onRename: (path: string, name: string) => Promise<void>;
  onDelete: (path: string) => Promise<void>;
}

const MAX_IMPORT_FILE_BYTES = 4 * 1024 * 1024 * 1024 - 1;
const UNMOUNT_UPLOAD_CACHE_CLEANUP_MS = 6000;

export function WifiImportManager({
  transport, supported, status, onEnsureReady, onFinish, onFinished, onCancel, onStartUpgrade, onList, onUpload, onRename, onDelete,
}: WifiImportManagerProps) {
  const { t } = useI18n();
  const palette = usePalette();
  const [picked, setPicked] = useState<PickedFile[]>([]);
  const [folder, setFolder] = useState('');
  const [directory, setDirectory] = useState<WifiImportDirectoryPage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<Progress | null>(null);
  const [browseDestination, setBrowseDestination] = useState(false);
  const [autoStartFailed, setAutoStartFailed] = useState(false);
  const [renamePath, setRenamePath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [pickedRenameUri, setPickedRenameUri] = useState<string | null>(null);
  const [pickedRenameValue, setPickedRenameValue] = useState('');
  const aliveRef = useRef(true);
  const autoPickerStartedRef = useRef(false);
  const cacheUrisRef = useRef(new Set<string>());
  const uploadControllerRef = useRef<AbortController | null>(null);
  const uploadGenerationRef = useRef(0);
  const currentUploadFileRef = useRef<number | null>(null);
  const directoryGenerationRef = useRef(0);
  const directoryBusyRef = useRef(false);
  const pickerOpenRef = useRef(false);
  const cacheNameCounterRef = useRef(0);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  const removeCachedFile = useCallback((uri: string) => {
    if (!cacheUrisRef.current.delete(uri)) return;
    void FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      onCancelRef.current();
      const wasUploading = uploadControllerRef.current != null;
      directoryGenerationRef.current++;
      uploadGenerationRef.current++;
      currentUploadFileRef.current = null;
      uploadControllerRef.current?.abort();
      const ownedUris = [...cacheUrisRef.current];
      if (wasUploading) {
        setTimeout(() => {
          for (const uri of ownedUris) void FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
          cacheUrisRef.current.clear();
        }, UNMOUNT_UPLOAD_CACHE_CLEANUP_MS);
      } else {
        for (const uri of ownedUris) void FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
        cacheUrisRef.current.clear();
      }
    };
  }, []);

  const loadDirectory = useCallback(async (path: string, append = false) => {
    if (directoryBusyRef.current) return;
    directoryBusyRef.current = true;
    const generation = ++directoryGenerationRef.current;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const page = await onList(path, append ? (directory?.nextOffset ?? 0) : 0);
      if (!aliveRef.current || generation !== directoryGenerationRef.current) return;
      setFolder(page.path);
      setDirectory((previous) => append && previous
        ? { ...page, entries: [...previous.entries, ...page.entries] }
        : page);
    } catch (cause: any) {
      if (aliveRef.current && generation === directoryGenerationRef.current) setError(cause?.message || t('Could not read the SD card.'));
    } finally {
      if (generation === directoryGenerationRef.current) directoryBusyRef.current = false;
      if (aliveRef.current && generation === directoryGenerationRef.current) setBusy(false);
    }
  }, [directory?.nextOffset, onList, t]);

  const pickFiles = useCallback(async () => {
    if (pickerOpenRef.current) return;
    pickerOpenRef.current = true;
    setError(null);
    const createdThisPick: string[] = [];
    const cleanupCreated = () => {
      for (const uri of createdThisPick) removeCachedFile(uri);
      createdThisPick.length = 0;
    };
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: true, copyToCacheDirectory: false });
      if (result.canceled) return;
      if (!aliveRef.current) return;
      const accepted: PickedFile[] = [];
      const rejected: string[] = [];
      for (let index = 0; index < result.assets.length; index++) {
        const asset = result.assets[index];
        if (!asset.uri || !asset.name) continue;
        if (Number.isFinite(asset.size) && asset.size! > MAX_IMPORT_FILE_BYTES) {
          rejected.push(asset.name);
          continue;
        }
        let size = Number.isFinite(asset.size) && asset.size! >= 0 ? asset.size : undefined;
        try {
          const sourceInfo = await FileSystem.getInfoAsync(asset.uri);
          if (sourceInfo.exists && typeof sourceInfo.size === 'number') size = sourceInfo.size;
        } catch { /* Use the picker-reported size when the provider cannot stat the source. */ }
        if (!aliveRef.current) { cleanupCreated(); return; }
        if (size == null || size > MAX_IMPORT_FILE_BYTES) {
          rejected.push(asset.name);
          continue;
        }
        const cacheRoot = FileSystem.cacheDirectory;
        if (!cacheRoot) throw new Error('The app cache is unavailable.');
        cacheNameCounterRef.current++;
        const localUri = `${cacheRoot}compas-import-${Date.now()}-${cacheNameCounterRef.current}-${Math.random().toString(36).slice(2)}.upload`;
        cacheUrisRef.current.add(localUri);
        createdThisPick.push(localUri);
        try {
          await FileSystem.copyAsync({ from: asset.uri, to: localUri });
        } finally {
          // Unmount cleanup may already have run while the native copy was pending.
          // Delete this exact app-owned destination once the copy operation settles.
          if (!aliveRef.current) {
            cacheUrisRef.current.delete(localUri);
            await FileSystem.deleteAsync(localUri, { idempotent: true }).catch(() => {});
          }
        }
        if (!aliveRef.current) {
          cleanupCreated();
          return;
        }
        const copiedInfo = await FileSystem.getInfoAsync(localUri);
        if (!aliveRef.current) {
          cleanupCreated();
          return;
        }
        if (!copiedInfo.exists || typeof copiedInfo.size !== 'number') {
          rejected.push(asset.name);
          removeCachedFile(localUri);
          continue;
        }
        if (copiedInfo.size > MAX_IMPORT_FILE_BYTES) {
          rejected.push(asset.name);
          removeCachedFile(localUri);
          continue;
        }
        accepted.push({ uri: localUri, name: asset.name, size: copiedInfo.size });
      }
      if (!aliveRef.current) {
        cleanupCreated();
        return;
      }
      setPicked((previous) => [...previous, ...accepted]);
      createdThisPick.length = 0;
      if (rejected.length) setError(t('Files must be 4 GiB or smaller: {files}', { files: rejected.join(', ') }));
    } catch (cause: any) {
      // A picker batch that fails partway through must not strand copied cache files.
      cleanupCreated();
      if (aliveRef.current) setError(cause?.message || t('Could not open the phone file picker.'));
    } finally {
      pickerOpenRef.current = false;
    }
  }, [picked, removeCachedFile, t]);

  useEffect(() => {
    if (transport !== ConnectionTransport.Wifi || !supported || autoPickerStartedRef.current) return;
    autoPickerStartedRef.current = true;
    void (async () => {
      try {
        await onEnsureReady();
        if (aliveRef.current) setAutoStartFailed(false);
        if (aliveRef.current) await pickFiles();
      } catch (cause: any) {
        if (aliveRef.current) { autoPickerStartedRef.current = false; setAutoStartFailed(true); setError(cause?.message || t('Could not start Wi-Fi import.')); }
      }
    })();
  }, [onEnsureReady, pickFiles, supported, t, transport]);

  const uploadPicked = useCallback(async () => {
    if (busy || picked.length === 0) return;
    const controller = new AbortController();
    uploadControllerRef.current = controller;
    const generation = ++uploadGenerationRef.current;
    setBusy(true);
    setError(null);
    let uploadedCount = 0;
    const files = [...picked];
    try {
      for (let index = 0; index < files.length; index++) {
        const file = files[index];
        if (controller.signal.aborted) throw new Error('Upload cancelled');
        currentUploadFileRef.current = index;
        setUploadProgress({ fileIndex: index + 1, fileCount: files.length, sent: 0, total: file.size ?? 0 });
        await onUpload(file.uri, folder, file.name, (sent, total) => {
          if (aliveRef.current && !controller.signal.aborted && uploadGenerationRef.current === generation && currentUploadFileRef.current === index) {
            setUploadProgress({ fileIndex: index + 1, fileCount: files.length, sent, total });
          }
        }, controller.signal);
        uploadedCount++;
        removeCachedFile(file.uri);
        if (aliveRef.current) setPicked((previous) => previous.filter((item) => item.uri !== file.uri));
      }
      if (aliveRef.current) {
        setUploadProgress(null);
        setBrowseDestination(false);
        await loadDirectory(folder);
        setNotice(t('{count} files uploaded.', { count: uploadedCount }));
      }
    } catch (cause: any) {
      if (aliveRef.current && !controller.signal.aborted) {
        setError(cause?.statusCode === 409
          ? t('A file with this name already exists. Rename the file or choose another destination.')
          : cause?.message || t('Upload stopped. You can retry the remaining files.'));
      }
      for (const file of files.slice(uploadedCount)) {
        if (controller.signal.aborted) break;
        // Keep unuploaded cache files for retry while this manager remains open.
        if (!aliveRef.current) removeCachedFile(file.uri);
      }
      if (controller.signal.aborted) {
        for (const file of files.slice(uploadedCount)) removeCachedFile(file.uri);
        if (aliveRef.current) setPicked((previous) => previous.filter((file) => !files.slice(uploadedCount).some((pending) => pending.uri === file.uri)));
      }
    } finally {
      if (uploadGenerationRef.current === generation) {
        uploadControllerRef.current = null;
        currentUploadFileRef.current = null;
      }
      if (aliveRef.current) { setBusy(false); setUploadProgress(null); }
    }
  }, [busy, folder, loadDirectory, onUpload, picked, removeCachedFile, t]);

  const finish = async () => {
    if (busy) return;
    setBusy(true);
    try { await onFinish(); if (aliveRef.current) onFinished(); } catch (cause: any) { if (aliveRef.current) setError(cause?.message || t('Could not finish import.')); }
    finally { if (aliveRef.current) setBusy(false); }
  };

  const deleteEntry = (entry: WifiImportFileEntry) => {
    Alert.alert(t('Delete file?'), t('Delete {name} from the SD card?', { name: entry.name }), [
      { text: t('Cancel'), style: 'cancel' },
      { text: t('Delete'), style: 'destructive', onPress: () => {
        if (!aliveRef.current) return;
        setBusy(true); setError(null);
        void onDelete(entry.path).then(() => { if (aliveRef.current) return loadDirectory(folder); })
          .catch((cause: any) => { if (aliveRef.current) setError(cause?.message || t('Could not delete file.')); })
          .finally(() => { if (aliveRef.current) setBusy(false); });
      } },
    ]);
  };

  const saveRename = async () => {
    if (!renamePath || !renameValue.trim() || busy) return;
    setBusy(true); setError(null);
    try {
      await onRename(renamePath, renameValue.trim());
      if (!aliveRef.current) return;
      setRenamePath(null); setRenameValue('');
      await loadDirectory(folder);
    } catch (cause: any) { if (aliveRef.current) setError(readableRenameError(cause, t)); }
    finally { if (aliveRef.current) setBusy(false); }
  };

  const savePickedRename = (uri: string) => {
    const name = pickedRenameValue.trim();
    if (!name || /[\\/\u0000-\u001f]/.test(name) || name === '.' || name === '..') {
      setError(t('Enter a valid file name'));
      return;
    }
    setPicked((previous) => previous.map((file) => file.uri === uri ? { ...file, name } : file));
    setPickedRenameUri(null);
    setPickedRenameValue('');
    setError(null);
  };

  if (transport === ConnectionTransport.Bluetooth) {
    return (
      <View style={styles.content}>
        <AppText variant="caption" tone="inkMuted" style={styles.help}>{t('Turn on Wi-Fi on the player and connect this phone to the same network. Keep Bluetooth connected while the app searches for that player.')}</AppText>
        {!supported ? <InlineError message={t('Update the player firmware to use Wi-Fi import.')} /> : null}
        {error ? <InlineError message={error} /> : null}
        {busy ? <View style={styles.status}><Spinner /><AppText variant="caption" tone="inkMuted">{t('Searching for this player on Wi-Fi…')}</AppText></View> : null}
        <Button label={t(error ? 'Try again' : 'Continue')} icon="wifi" busy={busy} disabled={!supported} onPress={() => {
          if (!aliveRef.current || busy) return;
          setBusy(true); setError(null);
          void onStartUpgrade()
            .catch((cause: any) => { if (aliveRef.current) setError(t(cause?.message || 'Could not find this player on Wi-Fi.')); })
            .finally(() => { if (aliveRef.current) setBusy(false); });
        }} />
      </View>
    );
  }

  if (!supported) return <View style={styles.content}><InlineError message={t('Update the player firmware to use Wi-Fi import.')} /></View>;

  const currentEntries = directory?.entries ?? [];
  const parent = folder ? folder.split('/').slice(0, -1).join('/') : null;
  const progressPercent = uploadProgress && uploadProgress.total > 0
    ? Math.min(100, Math.round(uploadProgress.sent * 100 / uploadProgress.total)) : 0;

  return (
    <View style={styles.content}>
      <AppText variant="caption" tone="inkMuted" style={styles.help}>{t('Choose files on this phone, then select an SD card folder. Files upload directly to the player over the authenticated Wi-Fi connection.')}</AppText>
      {(status.state === 'starting' || status.state === 'stopping' || directoryBusyRef.current) ? (
        <View style={styles.status}><Spinner /><AppText variant="caption" tone="inkMuted">{t(status.state === 'starting' ? 'Starting Wi-Fi import…' : 'Loading SD card…')}</AppText></View>
      ) : null}
      {error ? <InlineError message={error} /> : null}
      {notice ? <AppText variant="caption" tone="accent">{notice}</AppText> : null}
      {autoStartFailed && (status.state === 'error' || status.state === 'stopped') && !busy ? (
        <Button size="sm" variant="plain" label={t('Try again')} disabled={!supported} onPress={() => {
          setError(null); setBusy(true);
          void onEnsureReady().then(() => { if (aliveRef.current) setAutoStartFailed(false); return pickFiles(); })
            .catch((cause: any) => { if (aliveRef.current) { setAutoStartFailed(true); setError(cause?.message || t('Could not start Wi-Fi import.')); } })
            .finally(() => { if (aliveRef.current) setBusy(false); });
        }} />
      ) : null}
      {picked.length ? (
        <View style={styles.picked}>
          <AppText variant="eyebrow" tone="inkMuted">{t('Selected files')} · {picked.length}</AppText>
          <AppText variant="caption" tone="inkMuted">{t('Destination')}: {folder ? `SD/${folder}` : 'SD/'}</AppText>
          {picked.map((file) => (
            <View key={file.uri} style={styles.pickedRow}>
              {pickedRenameUri === file.uri ? (
                <>
                  <TextField value={pickedRenameValue} onChangeText={setPickedRenameValue} autoCapitalize="none" editable={!busy} accessibilityLabel={t('New name')} />
                  <Button size="sm" label={t('Save')} disabled={!pickedRenameValue.trim() || busy} onPress={() => savePickedRename(file.uri)} />
                  <Button size="sm" variant="plain" label={t('Cancel')} onPress={() => setPickedRenameUri(null)} />
                </>
              ) : (
                <>
                  <AppText variant="caption" numberOfLines={1} style={styles.pickedName}>{file.name}{file.size != null ? ` · ${formatBytes(file.size)}` : ''}</AppText>
                  <Button size="sm" variant="plain" label={t('Rename')} disabled={busy} onPress={() => { setPickedRenameUri(file.uri); setPickedRenameValue(file.name); }} />
                  <Button size="sm" variant="plain" label={t('Remove')} disabled={busy} onPress={() => { removeCachedFile(file.uri); setPicked((previous) => previous.filter((item) => item.uri !== file.uri)); }} />
                </>
              )}
            </View>
          ))}
        </View>
      ) : null}
      {uploadProgress ? (
        <View style={styles.progress}>
          <AppText variant="caption" tone="inkMuted">{t('Uploading file {current} of {total}', { current: uploadProgress.fileIndex, total: uploadProgress.fileCount })} · {progressPercent}%</AppText>
          <View style={[styles.progressTrack, { backgroundColor: palette.surfaceRaised }]}><View style={[styles.progressFill, { backgroundColor: palette.accent, width: `${progressPercent}%` }]} /></View>
        </View>
      ) : null}
      <View style={styles.buttons}>
        <Button size="sm" label={t(picked.length ? 'Add files' : 'Choose files')} icon="import" disabled={busy} onPress={() => void pickFiles()} />
        <Button size="sm" label={t(browseDestination ? 'Hide SD browser' : 'Browse SD card')} icon="folder" disabled={busy} onPress={() => {
          const showBrowser = !browseDestination;
          setBrowseDestination(showBrowser);
          if (showBrowser && !directory) void loadDirectory('');
        }} />
        {picked.length && browseDestination ? <Button size="sm" label={t('Upload files here')} icon="import" busy={busy} disabled={busy || !directory} onPress={() => void uploadPicked()} /> : null}
        {busy && uploadProgress ? <Button size="sm" label={t('Cancel upload')} variant="container" onPress={() => uploadControllerRef.current?.abort()} /> : null}
      </View>
      {browseDestination ? (
        <View style={styles.browser}>
          <Divider />
          <View style={styles.pathHeader}>
            {parent !== null ? <Button size="sm" variant="plain" label={t('Up')} icon="chevronLeft" disabled={busy} onPress={() => void loadDirectory(parent)} /> : null}
            <AppText variant="bodyStrong">{folder ? `SD/${folder}` : 'SD/'}</AppText>
            <Button size="sm" variant="plain" label={t('Refresh')} icon="refresh" disabled={busy} onPress={() => void loadDirectory(folder)} />
          </View>
          {currentEntries.length === 0 && directory ? <AppText variant="caption" tone="inkMuted" style={styles.empty}>{t('This folder is empty.')}</AppText> : null}
          {currentEntries.map((entry) => (
            <View key={entry.path}>
              {renamePath === entry.path ? (
                <View style={styles.renameRow}>
                  <TextField value={renameValue} onChangeText={setRenameValue} autoCapitalize="none" editable={!busy} accessibilityLabel={t('New name')} />
                  <Button size="sm" label={t('Save')} disabled={busy || !renameValue.trim()} onPress={() => void saveRename()} />
                  <Button size="sm" variant="plain" label={t('Cancel')} disabled={busy} onPress={() => setRenamePath(null)} />
                </View>
              ) : (
                <ListRow
                  title={entry.name}
                  subtitle={entry.isDirectory ? t('Folder') : formatBytes(entry.size)}
                  leading={<Icon name={entry.isDirectory ? 'folder' : 'file'} />}
                  trailing={entry.isDirectory ? <Icon name="chevronRight" /> : (
                    <View style={styles.fileActions}>
                      <Button size="sm" variant="plain" label={t('Rename')} onPress={() => { setRenamePath(entry.path); setRenameValue(entry.name); }} disabled={busy} />
                      <Button size="sm" variant="plain" label={t('Delete')} onPress={() => deleteEntry(entry)} disabled={busy} />
                    </View>
                  )}
                  onPress={entry.isDirectory ? () => void loadDirectory(entry.path) : undefined}
                  disabled={busy}
                />
              )}
            </View>
          ))}
          {directory?.nextOffset != null ? <Button size="sm" variant="plain" label={t('Load more')} disabled={busy} onPress={() => void loadDirectory(folder, true)} /> : null}
        </View>
      ) : null}
      <Divider />
      <Button label={t('Finish and rescan library')} icon="check" variant="container" disabled={busy || status.state !== 'ready'} onPress={() => void finish()} />
    </View>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KiB', 'MiB', 'GiB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

function readableRenameError(cause: any, translate: (source: string) => string): string {
  try {
    const response = JSON.parse(cause?.responseBody ?? '{}');
    if (response.code === 'rename_not_supported') return translate('The player cannot rename files on this SD card.');
  } catch { /* Fall back to the API error message. */ }
  return cause?.message || translate('Could not rename file.');
}

const styles = StyleSheet.create({
  content: { gap: Space.md, paddingBottom: Space.lg },
  help: { marginBottom: Space.xs },
  status: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, minHeight: 36 },
  picked: { gap: Space.xs, padding: Space.md, borderRadius: 16, backgroundColor: 'rgba(127,127,127,0.08)' },
  pickedRow: { flexDirection: 'row', alignItems: 'center', gap: Space.xs },
  pickedName: { flex: 1 },
  progress: { gap: Space.xs },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%' },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
  browser: { gap: Space.xs },
  pathHeader: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Space.sm },
  empty: { padding: Space.md },
  fileActions: { flexDirection: 'row', alignItems: 'center' },
  renameRow: { gap: Space.xs, padding: Space.sm },
});
