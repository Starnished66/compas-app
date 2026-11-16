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
import { formatBytes, planTransfer, selectionTotals } from '../../session/transferPlan';
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
import { SdBrowserError, SdBrowserView } from '../transfer/SdBrowserView';
import { HiddenFilesButton } from '../transfer/HiddenFilesButton';
import { useSdBrowser } from '../transfer/useSdBrowser';
import { TransferDestinationSheet } from '../sheets/TransferDestinationSheet';
import { isConnectionError, isTransferUnavailable } from '../../session/transferAvailability';
import { localizedMessage } from '../localizedLabels';
import { usePalette } from '../PaletteProvider';
import { Space } from '../tokens';
import { useStorageAccess } from '../useStorageAccess';

export interface TransferApi {
  status: WifiImportStatus;
  refresh: () => Promise<void>;
  start: () => Promise<void>;
  finish: () => Promise<void>;
  list: (path: string, offset: number, showHidden?: boolean) => Promise<{ path: string; entries: WifiImportFileEntry[]; nextOffset: number | null }>;
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
// A dropped Wi-Fi link reconnects on its own, but the player keeps refusing uploads for about a
// minute while the interrupted one times out; an upload keeps retrying that long before giving up.
const RECONNECT_WAIT_MS = 120000;
const UPLOAD_RETRY_DELAY_MS = 3000;

type Pane = 'phone' | 'sd';

export function TransferScreen({ state, onAction, transfer, active, contentBottomInset }: TransferScreenProps) {
  const { t } = useI18n();
  const storage = useStorageAccess();
  const connected = state.connectionStatus === ConnectionStatus.Connected;
  const reconnecting = state.connectionStatus === ConnectionStatus.Connecting;
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

  // Once the workspace has opened for this player it stays mounted through gates (an auto-reconnect
  // passes through Connecting), because unmounting aborts the upload and drops the selection.
  const workspaceKeyRef = useRef<string | null>(null);
  if (!gate) workspaceKeyRef.current = state.wifiAddress;
  const keepWorkspace = workspaceKeyRef.current === state.wifiAddress;

  if (!keepWorkspace) {
    return (
      <View style={[styles.screen, { paddingBottom: contentBottomInset }]}>
        <ScreenTitleBar title={t('Transfer')} />
        <View style={styles.gate}>{gate}</View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingBottom: contentBottomInset }]}>
      <ScreenTitleBar title={t('Transfer')} />
      {gate && reconnecting ? (
        <View style={styles.banner}>
          <Spinner />
          <AppText variant="caption" tone="inkMuted" style={styles.flex}>{t('Reconnecting to the player…')}</AppText>
        </View>
      ) : gate ? <View style={styles.gateBanner}>{gate}</View> : null}
      <TransferWorkspace key={state.wifiAddress} transfer={transfer} active={active} connected={!gate} />
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
  /** Waiting for the player to take the file again after a dropped link. */
  waiting?: boolean;
}

function TransferWorkspace({ transfer, active, connected }: { transfer: TransferApi; active: boolean; connected: boolean }) {
  const { t } = useI18n();
  const palette = usePalette();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_LAYOUT_MIN_WIDTH;
  const transferRef = useRef(transfer);
  transferRef.current = transfer;
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);
  const errorText = useCallback((cause: any, fallback: string) =>
    isConnectionError(cause) ? t('Connection to Compás player was lost.') : cause?.message || fallback, [t]);

  const [pane, setPane] = useState<Pane>('phone');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Phone side
  const [roots, setRoots] = useState<StorageRoot[]>([]);
  const [root, setRoot] = useState<StorageRoot | null>(null);
  const [phonePath, setPhonePath] = useState<string | null>(null);
  const [phoneShowHidden, setPhoneShowHidden] = useState(false);
  const phoneHiddenRef = useRef(false);
  const [phoneEntries, setPhoneEntries] = useState<LocalFileEntry[]>([]);
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [selected, setSelected] = useState<Map<string, LocalFileEntry>>(() => new Map());
  const phoneGenerationRef = useRef(0);

  // Player side
  const sd = useSdBrowser(transfer, '', (cause) => { if (isTransferUnavailable(cause)) destinationUnavailable(); });
  const { path: sdPath, loaded: sdLoaded, load: loadSd, setEditing, setEditValue } = sd;
  const [choosingDestination, setChoosingDestination] = useState(false);
  const destinationUnavailable = useCallback(() => {
    sd.reset();
    setChoosingDestination(false);
    setError(t('The player SD card is unavailable'));
  }, [sd.reset, t]);

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
      const entries = await listLocalDirectory(path, phoneHiddenRef.current);
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

  // Set once the import session opens and cleared by Finish, so a reconnect reopens it.
  const wantSessionRef = useRef(false);
  const sdPathRef = useRef('');
  sdPathRef.current = sdPath;
  // An upload that ended offline shows its destination once the session reopens.
  const reopenPathRef = useRef<string | null>(null);
  const startSession = useCallback(async (requested = '') => {
    setStarting(true);
    setError(null);
    try {
      await transferRef.current.start();
      wantSessionRef.current = true;
      // Read after start: an upload may have ended while it was pending.
      const path = reopenPathRef.current ?? requested;
      reopenPathRef.current = null;
      if (aliveRef.current && !uploadControllerRef.current) await loadSd(path);
    } catch (cause: any) {
      if (aliveRef.current) setError(errorText(cause, t('Could not start Wi-Fi import.')));
    } finally {
      if (aliveRef.current) setStarting(false);
    }
  }, [errorText, loadSd, t]);

  // Reconnecting resets the player's import session; reopen it where the SD card was showing.
  useEffect(() => {
    if (connected && status === 'stopped' && wantSessionRef.current && !starting) void startSession(sdPathRef.current);
  }, [connected, status, starting, startSession]);

  // Open the player's import session the first time the tab is shown.
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (!active || autoStartedRef.current) return;
    autoStartedRef.current = true;
    void startSession();
  }, [active, startSession]);

  useEffect(() => {
    if (status === 'stopped' || status === 'error') sd.reset();
  }, [status, sd.reset]);

  const toggleSelected = (entry: LocalFileEntry) => {
    setSelected((previous) => {
      const next = new Map(previous);
      if (next.has(entry.path)) next.delete(entry.path);
      else next.set(entry.path, entry);
      return next;
    });
  };

  const { bytes: selectedFileBytes, folders: selectedFolders, count: selectedCount } = useMemo(
    () => selectionTotals([...selected.values()]), [selected]);

  const upload = async (destination: string) => {
    if (uploadControllerRef.current || uploading || !ready || !connected || selected.size === 0) return;
    setChoosingDestination(false);
    const controller = new AbortController();
    uploadControllerRef.current = controller;
    const api = transferRef.current;
    setError(null);
    setNotice(null);
    setPreparing(true);
    let uploaded = 0;
    let skipped = 0;
    const failed: string[] = [];
    try {
      const collected = await collectLocalFiles([...selected.keys()], phoneHiddenRef.current);
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
          uploaded++;
          offlineSince = null;
        } catch (cause: any) {
          if (controller.signal.aborted) throw cause;
          // The player drops a partial file, so the same file is sent again once the link is back.
          if (isConnectionError(cause)) {
            offlineSince ??= Date.now();
            const deadline = offlineSince + RECONNECT_WAIT_MS;
            if (Date.now() < deadline) {
              if (aliveRef.current) setJob({ ...base, sentBytes: doneBytes, waiting: true });
              await waitForSession(controller.signal, deadline);
              index--;
              continue;
            }
          }
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
      else {
        // Spell out what survived: the selection is kept so only the retry is left to the user.
        const summary = t('Upload stopped after {count} files. You can retry the remaining files.', { count: uploaded });
        setError(cause?.message ? `${summary} ${localizedMessage(cause.message, t)}` : summary);
      }
    } finally {
      if (uploadControllerRef.current === controller) uploadControllerRef.current = null;
      if (aliveRef.current) {
        setPreparing(false);
        setJob(null);
        if (uploaded) setUploadedSinceFinish((count) => count + uploaded);
        // Show the chosen folder while preserving the upload summary.
        setPane('sd');
        if (transferRef.current.status.state === 'ready') void loadSd(destination);
        else reopenPathRef.current = destination;
      }
    }
  };

  // The app may not have noticed the drop yet, so pause before checking that the session is back.
  const waitForSession = async (signal: AbortSignal, deadline: number) => {
    await new Promise((resolve) => setTimeout(resolve, UPLOAD_RETRY_DELAY_MS));
    while (transferRef.current.status.state !== 'ready') {
      if (signal.aborted) throw new Error('Upload cancelled');
      if (!aliveRef.current || Date.now() > deadline) throw new Error('Connection to Compás player was lost.');
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (signal.aborted) throw new Error('Upload cancelled');
  };

  const finish = async () => {
    if (uploading || finishing) return;
    setFinishing(true);
    setError(null);
    try {
      await transferRef.current.finish();
      wantSessionRef.current = false;
      if (!aliveRef.current) return;
      setUploadedSinceFinish(0);
      setNotice(t('The player is updating its library.'));
    } catch (cause: any) {
      if (aliveRef.current) setError(errorText(cause, t('Could not finish import.')));
    } finally {
      if (aliveRef.current) setFinishing(false);
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
        void sd.mutate(() => transferRef.current.remove(entry.path));
      } },
    ]);
  };

  // The native module names the primary volume in English; other volumes use the system's own label.
  const rootLabel = (item: StorageRoot) => (item.name === 'Internal storage' ? t('Internal storage') : item.name);
  const phoneRelative = phonePath && root ? phonePath.slice(root.path.length).replace(/^\//, '') : '';
  const phoneParent = phonePath && root && phonePath !== root.path ? phonePath.slice(0, phonePath.lastIndexOf('/')) : null;

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
          options={roots.map((item) => ({ value: item.path, label: rootLabel(item) }))}
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
        <AppText variant="bodyStrong" numberOfLines={1} style={styles.flex}>{phoneRelative ? `/${phoneRelative}` : root ? rootLabel(root) : ''}</AppText>
        <HiddenFilesButton title={t('This device')} showHidden={phoneShowHidden}
          disabled={uploading || phoneLoading || !phonePath} onPress={() => {
            if (!phonePath) return;
            phoneHiddenRef.current = !phoneHiddenRef.current;
            setPhoneShowHidden(phoneHiddenRef.current);
            setPhoneEntries([]);
            void openPhoneDirectory(phonePath);
          }} />
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
        {starting ? <Spinner /> : null}
      </View>
      {ready ? (
        <SdBrowserView browser={sd} canBrowse={ready && connected} canMutate={ready && connected && !uploading} onEntryActions={sdEntryActions} />
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
      <TransferDestinationSheet visible={choosingDestination} transfer={transfer} initialPath={sdPath} initialShowHidden={sd.showHidden} seed={sd} itemCount={selectedCount}
        available={connected && ready} onClose={(created) => { setChoosingDestination(false); if (created) void loadSd(sdPath); }}
        onUnavailable={destinationUnavailable} onSave={(path, created) => { if (created) void loadSd(sdPath); void upload(path); }} />
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
      {!wide && pane === 'phone' ? <SdBrowserError browser={sd} canBrowse={ready && connected} /> : null}
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
                {job?.waiting
                  ? t('Reconnecting to the player…')
                  : job ? `${formatBytes(job.sentBytes)} / ${formatBytes(job.totalBytes)} → ${job.destination ? `SD/${job.destination}` : 'SD/'}` : ''}
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
              label={t('Upload')}
              disabled={!connected || !ready || !sdLoaded || !!sd.editing || selected.size === 0}
              onPress={() => setChoosingDestination(true)}
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
  gateBanner: { paddingHorizontal: Space.lg, paddingBottom: Space.sm },
  banner: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingHorizontal: Space.lg, paddingBottom: Space.sm },
  workspace: { flex: 1, paddingHorizontal: Space.lg, gap: Space.sm },
  paneToggle: { marginBottom: Space.xs },
  panes: { flex: 1, gap: Space.md },
  panesWide: { flexDirection: 'row' },
  pane: { flex: 1, paddingVertical: Space.sm, overflow: 'hidden' },
  paneWide: { minWidth: 0 },
  paneHeader: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingHorizontal: Space.lg, minHeight: 40 },
  rootPicker: { marginHorizontal: Space.lg, marginBottom: Space.xs },
  pathRow: { flexDirection: 'row', alignItems: 'center', gap: Space.xs, paddingHorizontal: Space.sm, minHeight: 44 },
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
