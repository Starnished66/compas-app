import React from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import type { LocalFileEntry, StorageRoot } from '../../../modules/compas-files/src';
import type { WifiImportFileEntry } from '../../data/types';
import type { useI18n } from '../../i18n';
import { formatBytes } from '../../session/transferPlan';
import { AppText } from '../components/AppText';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { IconButton } from '../components/IconButton';
import { ListRow } from '../components/ListRow';
import { ProgressBar } from '../components/ProgressBar';
import { SegmentedControl } from '../components/SegmentedControl';
import { Spinner } from '../components/Spinner';
import type { usePalette } from '../PaletteProvider';
import { Space } from '../tokens';
import { HiddenFilesButton } from './HiddenFilesButton';
import { SdBrowserView } from './SdBrowserView';
import type { useSdBrowser } from './useSdBrowser';
import type { useTransferPhoneState } from './useTransferPhone';
import type { UploadJob } from './useTransferUploads';
import type { TransferApi } from '../screens/TransferScreen';

type Translate = ReturnType<typeof useI18n>['t'];
type Palette = ReturnType<typeof usePalette>;

interface PhonePaneOptions {
  phone: ReturnType<typeof useTransferPhoneState>;
  toggleSelected: (entry: LocalFileEntry) => void;
  openPhoneDirectory: (path: string) => Promise<void>;
  uploading: boolean;
  wide: boolean;
  palette: Palette;
  t: Translate;
}

export function renderPhonePane(options: PhonePaneOptions) {
  const { phone, openPhoneDirectory, uploading, wide, palette, t } = options;
  const { roots, root, setRoot, phonePath, phoneShowHidden, phoneHiddenRef, phoneEntries, phoneLoading, setPhoneShowHidden, setPhoneEntries } = phone;
  // The native module names the primary volume in English; other volumes use the system's own label.
  const rootLabel = (item: StorageRoot) => (item.name === 'Internal storage' ? t('Internal storage') : item.name);
  const phoneRelative = phonePath && root ? phonePath.slice(root.path.length).replace(/^\//, '') : '';
  const phoneParent = phonePath && root && phonePath !== root.path ? phonePath.slice(0, phonePath.lastIndexOf('/')) : null;

  return (
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
        renderItem={({ item }) => renderPhoneEntry(item, options)}
      />
    </Card>
  );
}

function renderPhoneEntry(item: LocalFileEntry, options: PhonePaneOptions) {
  const { phone, toggleSelected, uploading, palette, t, openPhoneDirectory } = options;
  const { selected } = phone;
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
}

interface SdPaneOptions {
  wide: boolean;
  palette: Palette;
  t: Translate;
  sd: ReturnType<typeof useSdBrowser>;
  starting: boolean;
  ready: boolean;
  connected: boolean;
  uploading: boolean;
  sdEntryActions: (entry: WifiImportFileEntry) => void;
  status: TransferApi['status']['state'];
  startSession: () => Promise<void>;
}

export function renderSdPane({
  wide, palette, t, sd, starting, ready, connected, uploading, sdEntryActions, status, startSession,
}: SdPaneOptions) {
  return (
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
}

interface TransferQueueOptions {
  job: UploadJob | null;
  uploading: boolean;
  onCancel: () => void;
  selectionSummary: string;
  selectedSize: number;
  clearSelected: () => void;
  connected: boolean;
  ready: boolean;
  sdLoaded: boolean;
  editing: boolean;
  chooseDestination: () => void;
  uploadedSinceFinish: number;
  finishing: boolean;
  finish: () => Promise<void>;
  t: Translate;
}

export function renderTransferQueue({
  job, uploading, onCancel, selectionSummary, selectedSize, clearSelected, connected, ready,
  sdLoaded, editing, chooseDestination, uploadedSinceFinish, finishing, finish, t,
}: TransferQueueOptions) {
  return (
    <Card variant="surface" style={styles.actionBar}>
      {uploading ? (
        renderUploadMeter(job, onCancel, t)
      ) : (
        <View style={[styles.actionRow, styles.actionWrap]}>
          <AppText variant="caption" tone="inkMuted" style={styles.summary}>{selectionSummary}</AppText>
          {selectedSize ? <Button size="sm" variant="plain" label={t('Clear')} onPress={clearSelected} /> : null}
          <Button
            size="md"
            icon="import"
            label={t('Upload')}
            disabled={!connected || !ready || !sdLoaded || editing || selectedSize === 0}
            onPress={chooseDestination}
          />
          {ready && uploadedSinceFinish > 0 ? (
            <Button size="md" variant="container" icon="check" label={t('Finish and rescan library')} busy={finishing} onPress={() => void finish()} />
          ) : null}
        </View>
      )}
    </Card>
  );
}

function renderUploadMeter(job: UploadJob | null, onCancel: () => void, t: Translate) {
  const progress = job && job.totalBytes > 0 ? job.sentBytes / job.totalBytes : 0;
  return (
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
        <Button size="sm" variant="container" label={t('Cancel upload')} onPress={onCancel} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pane: { flex: 1, paddingVertical: Space.sm, overflow: 'hidden' },
  paneWide: { minWidth: 0 },
  paneHeader: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingHorizontal: Space.lg, minHeight: 40 },
  rootPicker: { marginHorizontal: Space.lg, marginBottom: Space.xs },
  pathRow: { flexDirection: 'row', alignItems: 'center', gap: Space.xs, paddingHorizontal: Space.sm, minHeight: 44 },
  list: { flex: 1 },
  empty: { padding: Space.lg },
  sessionState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Space.md, padding: Space.lg },
  centered: { textAlign: 'center' },
  actionBar: { padding: Space.md },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  actionWrap: { flexWrap: 'wrap', justifyContent: 'flex-end' },
  summary: { flexGrow: 1, flexShrink: 1, minWidth: 160 },
  progress: { gap: Space.sm },
  flex: { flex: 1 },
});
