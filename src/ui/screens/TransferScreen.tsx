import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, StyleSheet, useWindowDimensions, View } from 'react-native';
import {
  collectLocalFiles,
  getStorageRoots,
  isFileBrowsingAvailable,
  listLocalDirectory,
  localFileUri,
  LocalFileEntry,
  StorageRoot,
} from '../../../modules/compas-files/src';
import {
  ConnectionStatus,
  ConnectionTransport,
  RemoteAction,
  RemoteUiState,
  WifiImportFileEntry,
  WifiImportStatus,
} from '../../data/types';
import { useI18n } from '../../i18n';
import { formatBytes, joinSdPath, planTransfer, sdParent } from '../../session/transferPlan';
import { AppText } from '../components/AppText';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { IconButton } from '../components/IconButton';
import { InlineError } from '../components/InlineError';
import { ListRow } from '../components/ListRow';
import { MessageCard } from '../components/MessageCard';
import { ProgressBar } from '../components/ProgressBar';
import { ScreenTitleBar } from '../components/ScreenTitleBar';
import { SegmentedControl } from '../components/SegmentedControl';
import { Spinner } from '../components/Spinner';
import { TextField } from '../components/TextField';
import { usePalette } from '../PaletteProvider';
import { Space } from '../tokens';
import { useStorageAccess } from '../useStorageAccess';

export interface TransferApi {
  status: WifiImportStatus;
  start: () => Promise<void>;
  finish: () => Promise<void>;
  list: (path: string, offset: number) => Promise<{ path: string; entries: WifiImportFileEntry[]; nextOffset: number | null }>;
  upload: (uri: string, path: string, name: string, onProgress: (sent: number, total: number) => void, signal: AbortSignal) => Promise<void>;
  rename: (path: string, name: string) => Promise<void>;
  remove: (path: string) => Promise<void>;
  mkdir: (path: string, name: string) => Promise<void>;
}

export interface TransferScreenProps {
  state: RemoteUiState;
  onAction: (action: RemoteAction) => void;
  transfer: TransferApi;
  active: boolean;
  contentBottomInset: number;
}

const MAX_FILE_BYTES = 4 * 1024 * 1024 * 1024 - 1;
const WIDE_LAYOUT_MIN_WIDTH = 720;
const PROGRESS_INTERVAL_MS = 150;

type Pane = 'phone' | 'sd';

export function TransferScreen({ state, onAction, transfer, active, contentBottomInset }: TransferScreenProps) {
  const { t } = useI18n();
  const storage = useStorageAccess();
  const connected = state.connectionStatus === ConnectionStatus.Connected;
  const supported = state.supportedFeatures.includes('wifi_import') && state.supportedFeatures.includes('wifi_import_files');

  let gate: React.ReactNode = null;
  if (!connected) {
    gate = (
      <MessageCard
        title={t('Connect to a player')}
        body={t('Connect to your player over Wi-Fi to send music from this device to its SD card.')}
        actionLabel={t('Connection and players')}
        actionIcon="wifi"
        onAction={() => onAction({ type: 'OpenConnection' })}
      />
    );
  } else if (state.connectionTransport !== ConnectionTransport.Wifi) {
    gate = (
      <MessageCard
        title={t('File transfer needs Wi-Fi')}
        body={t('You are connected over Bluetooth. Connect to the player over Wi-Fi on the same network to transfer files.')}
        actionLabel={t('Connection and players')}
        actionIcon="wifi"
        onAction={() => onAction({ type: 'OpenConnection' })}
      />
    );
  } else if (!supported) {
    gate = <MessageCard title={t('File transfer unavailable')} body={t('Update the player firmware to use Wi-Fi import.')} />;
  } else if (!isFileBrowsingAvailable()) {
    gate = <MessageCard title={t('File transfer unavailable')} body={t('This device cannot browse its files.')} />;
  } else if (!storage.granted) {
    gate = (
      <MessageCard
        title={t('Allow file access')}
        body={t('Compás needs access to this device’s files to show your music folders. Turn on “Allow access to manage all files”, then come back.')}
        actionLabel={t('Allow access')}
        actionIcon="folder"
        onAction={() => void storage.request()}
      />
    );
  }

  return (
    <View style={[styles.screen, { paddingBottom: contentBottomInset }]}>
      <ScreenTitleBar title={t('Transfer')} />
      {gate ? <View style={styles.gate}>{gate}</View> : (
        <TransferWorkspace key={state.wifiAddress} transfer={transfer} active={active} />
      )}
    </View>
  );
}

interface UploadJob {
  fileIndex: number;
  fileCount: number;
  fileName: string;
  sentBytes: number;
  totalBytes: number;
  destination: string;
}

function TransferWorkspace({ transfer, active }: { transfer: TransferApi; active: boolean }) {
  const { t } = useI18n();
  const palette = usePalette();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_LAYOUT_MIN_WIDTH;
  const transferRef = useRef(transfer);
  transferRef.current = transfer;
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);

  const [pane, setPane] = useState<Pane>('phone');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Phone side
  const [roots, setRoots] = useState<StorageRoot[]>([]);
  const [root, setRoot] = useState<StorageRoot | null>(null);
  const [phonePath, setPhonePath] = useState<string | null>(null);
  const [phoneEntries, setPhoneEntries] = useState<LocalFileEntry[]>([]);
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [selected, setSelected] = useState<Map<string, LocalFileEntry>>(() => new Map());
  const phoneGenerationRef = useRef(0);

  // Player side
  const [sdPath, setSdPath] = useState('');
  const [sdEntries, setSdEntries] = useState<WifiImportFileEntry[]>([]);
  const [sdNextOffset, setSdNextOffset] = useState<number | null>(null);
  const [sdLoading, setSdLoading] = useState(false);
  const [sdLoaded, setSdLoaded] = useState(false);
  const [editing, setEditing] = useState<{ kind: 'mkdir' } | { kind: 'rename'; entry: WifiImportFileEntry } | null>(null);
  const [editValue, setEditValue] = useState('');
  const sdGenerationRef = useRef(0);

  const [starting, setStarting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [job, setJob] = useState<UploadJob | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [uploadedSinceFinish, setUploadedSinceFinish] = useState(0);
  const uploadControllerRef = useRef<AbortController | null>(null);
  useEffect(() => () => uploadControllerRef.current?.abort(), []);

  const status = transfer.status.state;
  const ready = status === 'ready';
  const uploading = preparing || job != null;

  const openPhoneDirectory = useCallback(async (path: string) => {
    const generation = ++phoneGenerationRef.current;
    setPhoneLoading(true);
    setError(null);
    try {
      const entries = await listLocalDirectory(path);
      if (!aliveRef.current || generation !== phoneGenerationRef.current) return;
      setPhonePath(path);
      setPhoneEntries(entries);
    } catch (cause: any) {
      if (aliveRef.current && generation === phoneGenerationRef.current) setError(cause?.message || t('Could not read this folder.'));
    } finally {
      if (aliveRef.current && generation === phoneGenerationRef.current) setPhoneLoading(false);
    }
  }, [t]);

  useEffect(() => {
    try {
      const available = getStorageRoots();
      setRoots(available);
      const initial = available[0] ?? null;
      setRoot(initial);
      if (initial) void openPhoneDirectory(initial.path);
    } catch (cause: any) {
      setError(cause?.message || t('Could not read this folder.'));
    }
  }, [openPhoneDirectory, t]);

  const loadSd = useCallback(async (path: string, append = false, offset = 0) => {
    const generation = ++sdGenerationRef.current;
    setSdLoading(true);
    setError(null);
    try {
      const page = await transferRef.current.list(path, append ? offset : 0);
      if (!aliveRef.current || generation !== sdGenerationRef.current) return;
      setSdPath(page.path);
      setSdEntries((previous) => append ? [...previous, ...page.entries] : page.entries);
      setSdNextOffset(page.nextOffset);
      setSdLoaded(true);
    } catch (cause: any) {
      if (aliveRef.current && generation === sdGenerationRef.current) setError(cause?.message || t('Could not read the SD card.'));
    } finally {
      if (aliveRef.current && generation === sdGenerationRef.current) setSdLoading(false);
    }
  }, [t]);

  const startSession = useCallback(async () => {
    setStarting(true);
    setError(null);
    try {
      await transferRef.current.start();
      if (aliveRef.current) await loadSd('');
    } catch (cause: any) {
      if (aliveRef.current) setError(cause?.message || t('Could not start Wi-Fi import.'));
    } finally {
      if (aliveRef.current) setStarting(false);
    }
  }, [loadSd, t]);

  // Open the player's import session the first time the tab is shown.
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (!active || autoStartedRef.current) return;
    autoStartedRef.current = true;
    void startSession();
  }, [active, startSession]);

  useEffect(() => {
    if (status === 'stopped') {
      sdGenerationRef.current++;
      setSdLoaded(false);
      setSdEntries([]);
      setSdNextOffset(null);
      setEditing(null);
    }
  }, [status]);

  const toggleSelected = (entry: LocalFileEntry) => {
    setSelected((previous) => {
      const next = new Map(previous);
      if (next.has(entry.path)) next.delete(entry.path);
      else next.set(entry.path, entry);
      return next;
    });
  };

  const selectedFileBytes = useMemo(() => {
    let bytes = 0;
    selected.forEach((entry) => { if (!entry.isDirectory) bytes += entry.size; });
    return bytes;
  }, [selected]);
  const selectedFolders = useMemo(() => [...selected.values()].filter((entry) => entry.isDirectory).length, [selected]);

  const upload = async () => {
    if (uploading || !ready || selected.size === 0) return;
    const controller = new AbortController();
    uploadControllerRef.current = controller;
    const api = transferRef.current;
    const destination = sdPath;
    setError(null);
    setNotice(null);
    setPreparing(true);
    let uploaded = 0;
    let skipped = 0;
    const failed: string[] = [];
    try {
      const collected = await collectLocalFiles([...selected.keys()]);
      const tooLarge = collected.filter((file) => file.size > MAX_FILE_BYTES);
      failed.push(...tooLarge.map((file) => file.name));
      const plan = planTransfer(collected.filter((file) => file.size <= MAX_FILE_BYTES), destination);
      for (const [parent, name] of plan.directories) {
        if (controller.signal.aborted) throw new Error('Upload cancelled');
        await api.mkdir(parent, name);
      }
      if (!aliveRef.current) return;
      setPreparing(false);
      let doneBytes = 0;
      let lastProgressAt = 0;
      for (let index = 0; index < plan.uploads.length; index++) {
        if (controller.signal.aborted) throw new Error('Upload cancelled');
        const { source, destination: folder } = plan.uploads[index];
        const base = { fileIndex: index + 1, fileCount: plan.uploads.length, fileName: source.name, totalBytes: plan.totalBytes, destination };
        if (aliveRef.current) setJob({ ...base, sentBytes: doneBytes });
        try {
          await api.upload(localFileUri(source.path), folder, source.name, (sent) => {
            const now = Date.now();
            if (!aliveRef.current || now - lastProgressAt < PROGRESS_INTERVAL_MS) return;
            lastProgressAt = now;
            setJob({ ...base, sentBytes: doneBytes + sent });
          }, controller.signal);
          uploaded++;
        } catch (cause: any) {
          if (controller.signal.aborted) throw cause;
          const code = cause?.statusCode;
          if (code === 409) skipped++;
          else if (code === 400 || code === 404 || code === 413 || cause?.message === 'Enter a valid file name') failed.push(source.name);
          else throw cause;
        }
        doneBytes += source.size;
      }
      if (!aliveRef.current) return;
      setSelected(new Map());
      setNotice([
        t('{count} files uploaded.', { count: uploaded }),
        skipped ? t('{count} already on the SD card.', { count: skipped }) : '',
      ].filter(Boolean).join(' '));
      if (failed.length) setError(t('Could not upload: {files}', { files: failed.join(', ') }));
    } catch (cause: any) {
      if (!aliveRef.current) return;
      if (controller.signal.aborted) setNotice(t('Upload cancelled. {count} files uploaded.', { count: uploaded }));
      else setError(cause?.message || t('Upload stopped. You can retry the remaining files.'));
    } finally {
      if (uploadControllerRef.current === controller) uploadControllerRef.current = null;
      if (aliveRef.current) {
        setPreparing(false);
        setJob(null);
        if (uploaded) setUploadedSinceFinish((count) => count + uploaded);
        if (transferRef.current.status.state === 'ready') void loadSd(destination);
      }
    }
  };

  const finish = async () => {
    if (uploading || finishing) return;
    setFinishing(true);
    setError(null);
    try {
      await transferRef.current.finish();
      if (!aliveRef.current) return;
      setUploadedSinceFinish(0);
      setNotice(t('The player is updating its library.'));
    } catch (cause: any) {
      if (aliveRef.current) setError(cause?.message || t('Could not finish import.'));
    } finally {
      if (aliveRef.current) setFinishing(false);
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    const name = editValue.trim();
    if (!name) return;
    setSdLoading(true);
    setError(null);
    try {
      if (editing.kind === 'mkdir') await transferRef.current.mkdir(sdPath, name);
      else await transferRef.current.rename(editing.entry.path, name);
      if (!aliveRef.current) return;
      setEditing(null);
      setEditValue('');
      await loadSd(sdPath);
    } catch (cause: any) {
      if (aliveRef.current) { setError(cause?.message || t('Could not rename file.')); setSdLoading(false); }
    }
  };

  const sdEntryActions = (entry: WifiImportFileEntry) => {
    if (uploading) return;
    Alert.alert(entry.name, undefined, [
      { text: t('Rename'), onPress: () => { setEditing({ kind: 'rename', entry }); setEditValue(entry.name); } },
      { text: t('Delete'), style: 'destructive', onPress: () => confirmDelete(entry) },
      { text: t('Cancel'), style: 'cancel' },
    ]);
  };

  const confirmDelete = (entry: WifiImportFileEntry) => {
    Alert.alert(t('Delete file?'), t('Delete {name} from the SD card?', { name: entry.name }), [
      { text: t('Cancel'), style: 'cancel' },
      { text: t('Delete'), style: 'destructive', onPress: () => {
        setError(null);
        void transferRef.current.remove(entry.path)
          .then(() => loadSd(sdPath))
          .catch((cause: any) => { if (aliveRef.current) setError(cause?.message || t('Could not delete file.')); });
      } },
    ]);
  };

  const phoneRelative = phonePath && root ? phonePath.slice(root.path.length).replace(/^\//, '') : '';
  const phoneParent = phonePath && root && phonePath !== root.path ? phonePath.slice(0, phonePath.lastIndexOf('/')) : null;
  const sdUp = sdParent(sdPath);

  const phonePane = (
    <Card variant="surface" style={[styles.pane, wide && styles.paneWide]}>
      <View style={styles.paneHeader}>
        <Icon name="music" size={18} color={palette.inkMuted} />
        <AppText variant="eyebrow" tone="inkMuted" style={styles.flex}>{t('This device')}</AppText>
        {phoneLoading ? <Spinner /> : null}
      </View>
      {roots.length > 1 ? (
        <SegmentedControl
          size="sm"
          options={roots.map((item) => ({ value: item.path, label: item.name }))}
          value={root?.path ?? ''}
          onChange={(path) => {
            const next = roots.find((item) => item.path === path) ?? null;
            setRoot(next);
            if (next) void openPhoneDirectory(next.path);
          }}
          style={styles.rootPicker}
        />
      ) : null}
      <View style={styles.pathRow}>
        <IconButton icon="chevronLeft" label={t('Up')} size="sm" disabled={!phoneParent || phoneLoading} onPress={() => phoneParent && void openPhoneDirectory(phoneParent)} />
        <AppText variant="bodyStrong" numberOfLines={1} style={styles.flex}>{phoneRelative ? `/${phoneRelative}` : root?.name ?? ''}</AppText>
      </View>
      <FlatList
        data={phoneEntries}
        keyExtractor={(entry) => entry.path}
        style={styles.list}
        ListEmptyComponent={!phoneLoading ? <AppText variant="caption" tone="inkMuted" style={styles.empty}>{t('This folder is empty.')}</AppText> : null}
        renderItem={({ item }) => {
          const isSelected = selected.has(item.path);
          return (
            <ListRow
              title={item.name}
              subtitle={item.isDirectory ? t('Folder') : formatBytes(item.size)}
              leading={<Icon name={item.isDirectory ? 'folder' : 'file'} color={isSelected ? palette.accent : undefined} />}
              selected={isSelected}
              trailing={(
                <IconButton
                  icon={isSelected ? 'check' : 'selectionCircle'}
                  label={isSelected ? t('Deselect {name}', { name: item.name }) : t('Select {name}', { name: item.name })}
                  color={isSelected ? palette.accent : undefined}
                  disabled={uploading}
                  onPress={() => toggleSelected(item)}
                />
              )}
              onPress={item.isDirectory ? () => void openPhoneDirectory(item.path) : () => !uploading && toggleSelected(item)}
              onLongPress={() => !uploading && toggleSelected(item)}
            />
          );
        }}
      />
    </Card>
  );

  const sdPane = (
    <Card variant="surface" style={[styles.pane, wide && styles.paneWide]}>
      <View style={styles.paneHeader}>
        <Icon name="sdCard" size={18} color={palette.inkMuted} />
        <AppText variant="eyebrow" tone="inkMuted" style={styles.flex}>{t('Player SD card')}</AppText>
        {sdLoading || starting ? <Spinner /> : null}
        <IconButton icon="plus" label={t('New folder')} size="sm" disabled={!ready || !sdLoaded || uploading} onPress={() => { setEditing({ kind: 'mkdir' }); setEditValue(''); }} />
        <IconButton icon="refresh" label={t('Refresh')} size="sm" disabled={!ready || sdLoading} onPress={() => void loadSd(sdPath)} />
      </View>
      <View style={styles.pathRow}>
        <IconButton icon="chevronLeft" label={t('Up')} size="sm" disabled={sdUp === null || sdLoading || !ready} onPress={() => sdUp !== null && void loadSd(sdUp)} />
        <AppText variant="bodyStrong" numberOfLines={1} style={styles.flex}>{sdPath ? `SD/${sdPath}` : 'SD/'}</AppText>
      </View>
      {editing ? (
        <View style={styles.editRow}>
          <View style={styles.flex}>
            <TextField
              value={editValue}
              onChangeText={setEditValue}
              autoFocus
              autoCapitalize="none"
              placeholder={editing.kind === 'mkdir' ? t('Folder name') : t('New name')}
              accessibilityLabel={editing.kind === 'mkdir' ? t('Folder name') : t('New name')}
              onSubmitEditing={() => void saveEdit()}
            />
          </View>
          <Button size="sm" label={editing.kind === 'mkdir' ? t('Create') : t('Save')} disabled={!editValue.trim() || sdLoading} onPress={() => void saveEdit()} />
          <Button size="sm" variant="plain" label={t('Cancel')} onPress={() => setEditing(null)} />
        </View>
      ) : null}
      {ready || sdLoaded ? (
        <FlatList
          data={sdEntries}
          keyExtractor={(entry) => entry.path}
          style={styles.list}
          ListEmptyComponent={sdLoaded && !sdLoading ? <AppText variant="caption" tone="inkMuted" style={styles.empty}>{t('This folder is empty.')}</AppText> : null}
          ListFooterComponent={sdNextOffset != null ? (
            <Button size="sm" variant="plain" label={t('Load more')} disabled={sdLoading} onPress={() => void loadSd(sdPath, true, sdNextOffset)} />
          ) : null}
          renderItem={({ item }) => (
            <ListRow
              title={item.name}
              subtitle={item.isDirectory ? t('Folder') : formatBytes(item.size)}
              leading={<Icon name={item.isDirectory ? 'folder' : 'file'} />}
              trailing={<IconButton icon="moreHorizontal" label={t('More options for {name}', { name: item.name })} size="sm" disabled={uploading} onPress={() => sdEntryActions(item)} />}
              onPress={item.isDirectory ? () => void loadSd(item.path) : undefined}
              onLongPress={() => sdEntryActions(item)}
            />
          )}
        />
      ) : (
        <View style={styles.sessionState}>
          {starting || status === 'starting' ? (
            <>
              <Spinner />
              <AppText variant="caption" tone="inkMuted">{t('Starting Wi-Fi import…')}</AppText>
            </>
          ) : (
            <>
              <AppText variant="caption" tone="inkMuted" style={styles.centered}>{t('Open the player’s SD card to choose where files go.')}</AppText>
              <Button size="sm" label={t('Open SD card')} icon="sdCard" busy={starting} onPress={() => void startSession()} />
            </>
          )}
        </View>
      )}
    </Card>
  );

  const progress = job && job.totalBytes > 0 ? job.sentBytes / job.totalBytes : 0;
  const selectionSummary = selected.size === 0
    ? t('Select files or folders on this device')
    : [
      t('{count} selected', { count: selected.size }),
      selectedFolders ? t('{count} folders', { count: selectedFolders }) : '',
      selectedFileBytes ? formatBytes(selectedFileBytes) : '',
    ].filter(Boolean).join(' · ');

  return (
    <View style={styles.workspace}>
      {!wide ? (
        <SegmentedControl
          options={[
            { value: 'phone', label: t('This device'), icon: 'music', caption: selected.size ? t('{count} selected', { count: selected.size }) : undefined },
            { value: 'sd', label: t('Player SD card'), icon: 'sdCard', caption: sdPath ? `SD/${sdPath}` : 'SD/' },
          ]}
          value={pane}
          onChange={setPane}
          style={styles.paneToggle}
        />
      ) : null}
      <View style={[styles.panes, wide && styles.panesWide]}>
        {wide || pane === 'phone' ? phonePane : null}
        {wide || pane === 'sd' ? sdPane : null}
      </View>
      {error ? <InlineError message={error} style={styles.message} /> : null}
      {notice ? <AppText variant="caption" tone="accent" style={styles.message}>{notice}</AppText> : null}
      <Card variant="surface" style={styles.actionBar}>
        {job || preparing ? (
          <View style={styles.progress}>
            <View style={styles.actionRow}>
              <AppText variant="caption" tone="inkMuted" numberOfLines={1} style={styles.flex}>
                {job
                  ? `${t('Uploading file {current} of {total}', { current: job.fileIndex, total: job.fileCount })} · ${job.fileName}`
                  : t('Preparing files…')}
              </AppText>
              {job ? <AppText variant="caption" tabular>{Math.round(progress * 100)}%</AppText> : null}
            </View>
            <ProgressBar value={progress} />
            <View style={styles.actionRow}>
              <AppText variant="caption" tone="inkMuted" style={styles.flex}>
                {job ? `${formatBytes(job.sentBytes)} / ${formatBytes(job.totalBytes)} → ${job.destination ? `SD/${job.destination}` : 'SD/'}` : ''}
              </AppText>
              <Button size="sm" variant="container" label={t('Cancel upload')} onPress={() => uploadControllerRef.current?.abort()} />
            </View>
          </View>
        ) : (
          <View style={[styles.actionRow, styles.actionWrap]}>
            <AppText variant="caption" tone="inkMuted" style={styles.summary}>{selectionSummary}</AppText>
            {selected.size ? <Button size="sm" variant="plain" label={t('Clear')} onPress={() => setSelected(new Map())} /> : null}
            <Button
              size="md"
              icon="import"
              label={t('Send to {folder}', { folder: sdPath ? `SD/${sdPath}` : 'SD/' })}
              disabled={!ready || !sdLoaded || selected.size === 0}
              onPress={() => void upload()}
            />
            {ready && uploadedSinceFinish > 0 ? (
              <Button size="md" variant="container" icon="check" label={t('Finish and rescan library')} busy={finishing} onPress={() => void finish()} />
            ) : null}
          </View>
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  gate: { paddingHorizontal: Space.lg, paddingTop: Space.md },
  workspace: { flex: 1, paddingHorizontal: Space.lg, gap: Space.sm },
  paneToggle: { marginBottom: Space.xs },
  panes: { flex: 1, gap: Space.md },
  panesWide: { flexDirection: 'row' },
  pane: { flex: 1, paddingVertical: Space.sm, overflow: 'hidden' },
  paneWide: { minWidth: 0 },
  paneHeader: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingHorizontal: Space.lg, minHeight: 40 },
  rootPicker: { marginHorizontal: Space.lg, marginBottom: Space.xs },
  pathRow: { flexDirection: 'row', alignItems: 'center', gap: Space.xs, paddingHorizontal: Space.sm, minHeight: 44 },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: Space.xs, paddingHorizontal: Space.lg, paddingBottom: Space.sm },
  list: { flex: 1 },
  empty: { padding: Space.lg },
  sessionState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Space.md, padding: Space.lg },
  centered: { textAlign: 'center' },
  message: { paddingHorizontal: Space.xs },
  actionBar: { padding: Space.md },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  actionWrap: { flexWrap: 'wrap', justifyContent: 'flex-end' },
  summary: { flexGrow: 1, flexShrink: 1, minWidth: 160 },
  progress: { gap: Space.sm },
  flex: { flex: 1 },
});
