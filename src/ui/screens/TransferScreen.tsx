import React, { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { isFileBrowsingAvailable } from '../../../modules/compas-files/src';
import {
  ConnectionStatus,
  ConnectionTransport,
  RemoteAction,
  RemoteUiState,
  WifiImportFileEntry,
  WifiImportStatus,
} from '../../data/types';
import { useI18n } from '../../i18n';
import { formatBytes, selectionTotals } from '../../session/transferPlan';
import type { AcquireTransferLeaseOptions, TransferSessionLease } from '../../session/transferSessionLeases';
import { isConnectionError } from '../../session/transferAvailability';
import { wifiImportErrorMessage } from '../../session/wifiImportError';
import { AppText } from '../components/AppText';
import { InlineError } from '../components/InlineError';
import { MessageCard } from '../components/MessageCard';
import { ScreenTitleBar } from '../components/ScreenTitleBar';
import { SegmentedControl } from '../components/SegmentedControl';
import { Spinner } from '../components/Spinner';
import { SdBrowserError } from '../transfer/SdBrowserView';
import { createSdEntryActions, useTransferDestination, useTransferSession } from '../transfer/useTransferDestination';
import { createFinishImport, createTransferUpload, useTransferUploadState, type TransferPane } from '../transfer/useTransferUploads';
import { createTransferDownload, useTransferDownloadState } from '../transfer/useTransferDownloads';
import { withoutSelectionsUnder } from '../transfer/sdSelection';
import { useTransferPhoneBrowser, useTransferPhoneSelection } from '../transfer/useTransferPhone';
import { renderPhonePane, renderSdPane, renderTransferQueue } from '../transfer/transferPanes';
import { LocalDestinationSheet } from '../sheets/LocalDestinationSheet';
import { TransferDestinationSheet } from '../sheets/TransferDestinationSheet';
import { localizedMessage } from '../localizedLabels';
import { usePalette } from '../PaletteProvider';
import { Space } from '../tokens';
import { useStorageAccess } from '../useStorageAccess';

type Translate = ReturnType<typeof useI18n>['t'];

export interface TransferApi {
  status: WifiImportStatus;
  refresh: () => Promise<void>;
  finish: () => Promise<void>;
  refreshAfterUpload: () => Promise<void>;
  acquire: (signal?: AbortSignal, options?: AcquireTransferLeaseOptions) => Promise<TransferSessionLease>;
  list: (path: string, offset: number, showHidden?: boolean) => Promise<{ path: string; entries: WifiImportFileEntry[]; nextOffset: number | null }>;
  /** Resolves with the path actually written, when the phone had to pick another free name. */
  download: (remotePath: string, destinationUri: string, onProgress: (received: number, total: number) => void, signal: AbortSignal) => Promise<string | null | void>;
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

const WIDE_LAYOUT_MIN_WIDTH = 720;

export function TransferScreen({ state, onAction, transfer, active, contentBottomInset }: TransferScreenProps) {
  const { t } = useI18n();
  const storage = useStorageAccess();
  const reconnecting = state.connectionStatus === ConnectionStatus.Connecting;
  const gate = renderTransferGate(state, onAction, storage, t);

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

function renderTransferGate(
  state: RemoteUiState, onAction: TransferScreenProps['onAction'],
  storage: ReturnType<typeof useStorageAccess>, t: Translate,
) {
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

  return gate;
}

interface WorkspaceProps {
  transfer: TransferApi;
  active: boolean;
  connected: boolean;
}

function TransferWorkspace(props: WorkspaceProps) {
  return renderTransferWorkspace(props, useTransferWorkspace(props));
}

/** The Transfer API with rename and delete keeping the SD download selection in step. */
function useSelectionAwareTransfer(transfer: TransferApi, setSdSelected: Dispatch<SetStateAction<Map<string, WifiImportFileEntry>>>) {
  return useMemo<TransferApi>(() => ({
    ...transfer,
    rename: async (path, name) => {
      await transfer.rename(path, name);
      setSdSelected((prev) => withoutSelectionsUnder(prev, path));
    },
    remove: async (path) => {
      await transfer.remove(path);
      setSdSelected((prev) => withoutSelectionsUnder(prev, path));
    },
  }), [transfer, setSdSelected]);
}

function useTransferWorkspace({ transfer: rawTransfer, active, connected }: WorkspaceProps) {
  const { t } = useI18n();
  const palette = usePalette();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_LAYOUT_MIN_WIDTH;
  const [sdSelected, setSdSelected] = useState<Map<string, WifiImportFileEntry>>(() => new Map());
  const transfer = useSelectionAwareTransfer(rawTransfer, setSdSelected);
  const transferRef = useRef(transfer);
  transferRef.current = transfer;
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);
  const errorText = useCallback((cause: any, fallback: string) => {
    if (isConnectionError(cause)) return t('Connection to Compás player was lost.');
    const message = typeof cause === 'string' ? cause : cause?.message;
    return localizedMessage(wifiImportErrorMessage(cause, message || fallback), t);
  }, [t]);

  const [pane, setPane] = useState<TransferPane>('phone');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const phone = useTransferPhoneBrowser(setError, t);
  const destination = useTransferDestination(transfer, setError, t);
  const uploadState = useTransferUploadState();
  const downloadState = useTransferDownloadState();
  const { sd, setChoosingDestination } = destination;
  const { uploading, uploadControllerRef } = uploadState;
  const busy = uploading || downloadState.downloading;
  const { selected, setSelected, phoneHiddenRef } = phone;
  const status = transfer.status.state;
  const ready = status === 'ready';
  const { startSession, reopenPathRef, wantSessionRef, leaseRef } = useTransferSession(destination, {
    connected, active, status, transferRef, aliveRef, uploadControllerRef, setError, errorText, t,
  });
  const selection = useTransferPhoneSelection(phone);
  const clearSelected = () => setSelected(new Map());
  const clearSdSelected = useCallback(() => setSdSelected(new Map()), []);
  // A finished folder takes anything selected inside it along.
  const deselectSd = useCallback((paths: readonly string[]) => {
    setSdSelected((prev) => paths.reduce(withoutSelectionsUnder, prev));
  }, []);
  const toggleSdSelected = useCallback((entry: WifiImportFileEntry) => {
    setSdSelected((prev) => {
      const next = new Map(prev);
      if (next.has(entry.path)) next.delete(entry.path);
      else next.set(entry.path, entry);
      return next;
    });
  }, []);
  const upload = createTransferUpload(uploadState, {
    transferRef, aliveRef, connected, ready, selected, phoneHiddenRef, setChoosingDestination, setSelected,
    setError, setNotice, setPane, t, loadSd: sd.load, reopenPathRef,
  });
  const download = createTransferDownload(downloadState, {
    transferRef, aliveRef, connected, ready, sdSelected, clearSdSelected, deselectSd, setError, setNotice,
    onRefreshPhone: phone.refresh,
    showHidden: sd.showHidden,
    t,
  });
  const finish = createFinishImport(uploadState, { transferRef, aliveRef, setError, setNotice, t }, wantSessionRef, leaseRef, errorText);
  const sdEntryActions = createSdEntryActions(sd, busy, transferRef, setError, t);
  return {
    t, palette, wide, pane, setPane, error, notice, phone, destination, uploadState, downloadState, ready, status, busy,
    sdSelected, toggleSdSelected, clearSdSelected,
    startSession, selection, clearSelected, upload, download, finish, sdEntryActions,
  };
}

function renderTransferWorkspace(
  { transfer, connected }: WorkspaceProps,
  workspace: ReturnType<typeof useTransferWorkspace>,
) {
  const { t, palette, wide, pane, setPane, error, notice, phone, destination, uploadState, downloadState, ready, status, busy,
    sdSelected, toggleSdSelected, clearSdSelected,
    startSession, selection, clearSelected, upload, download, finish, sdEntryActions } = workspace;
  const { selected } = phone;
  const { selectedFileBytes, selectedFolders, selectedCount, toggleSelected } = selection;
  const { sd, choosingDestination, setChoosingDestination, destinationUnavailable, starting } = destination;
  const { path: sdPath, loaded: sdLoaded, load: loadSd } = sd;
  const { job, uploading, uploadControllerRef, uploadedSinceFinish, finishing } = uploadState;
  const { downloadJob, downloading, choosingLocalDest, setChoosingLocalDest, downloadControllerRef } = downloadState;
  const phonePane = renderPhonePane({ phone, toggleSelected, uploading: busy, wide, palette, t });
  const sdPane = renderSdPane({
    wide, palette, t, sd, starting, ready, connected, busy, sdSelected, onToggleSdSelected: toggleSdSelected,
    sdEntryActions, status, startSession,
  });
  const sdTotals = selectionTotals([...sdSelected.values()]);
  const selectionSummary = sdSelected.size > 0
    ? [
      t('{count} selected', { count: sdSelected.size }),
      sdTotals.folders ? t('{count} folders', { count: sdTotals.folders }) : '',
      sdTotals.bytes ? formatBytes(sdTotals.bytes) : '',
    ].filter(Boolean).join(' · ')
    : selected.size === 0
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
      <LocalDestinationSheet
        visible={choosingLocalDest}
        initialPath={phone.phonePath ?? ''}
        onClose={() => setChoosingLocalDest(false)}
        onSave={(folderPath) => void download(folderPath)}
      />
      {!wide ? (
        <SegmentedControl
          options={[
            { value: 'phone', label: t('This device'), icon: 'music', caption: selected.size ? t('{count} selected', { count: selected.size }) : undefined },
            { value: 'sd', label: t('Player SD card'), icon: 'sdCard', caption: sdSelected.size ? t('{count} selected', { count: sdSelected.size }) : sdPath ? `SD/${sdPath}` : 'SD/' },
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
      {renderTransferQueue({
        job, uploading, onCancel: () => uploadControllerRef.current?.abort(),
        downloadJob, downloading, onCancelDownload: () => downloadControllerRef.current?.abort(),
        selectionSummary, selectedSize: selected.size, clearSelected,
        sdSelectedSize: sdSelected.size, clearSdSelected, chooseLocalDestination: () => setChoosingLocalDest(true),
        connected, ready, sdLoaded, editing: !!sd.editing, chooseDestination: () => setChoosingDestination(true),
        uploadedSinceFinish, finishing, finish, t,
      })}
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
  message: { paddingHorizontal: Space.xs },
  flex: { flex: 1 },
});
