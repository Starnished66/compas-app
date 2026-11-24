import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { localFileExists, localFileUri, isFileBrowsingAvailable } from '../../../modules/compas-files/src';
import { ConnectionTransport, type RemoteUiState, type WifiImportFileEntry } from '../../data/types';
import { useI18n } from '../../i18n';
import { findLatestScreenshot, listAllScreenshots } from '../../session/screenshotFile';
import { AppText } from '../components/AppText';
import { BottomSheet } from '../components/BottomSheet';
import { Button } from '../components/Button';
import { InlineError } from '../components/InlineError';
import { SheetStepTitle } from '../components/SheetStepTitle';
import { Spinner } from '../components/Spinner';
import { transferErrorText } from '../transfer/transferErrorText';
import type { TransferApi } from '../screens/TransferScreen';
import { useSnackbar } from '../snackbar/useSnackbar';
import { Space } from '../tokens';
import { uniqueLocalPath } from '../transfer/useTransferDownloads';
import { useTransferLeaseRunner } from '../transfer/useTransferLeaseRunner';
import { LocalDestinationSheet } from './LocalDestinationSheet';

export interface ScreenshotSheetProps {
  visible: boolean;
  state: RemoteUiState;
  sessionKey: string | null;
  takeScreenshot: () => Promise<void>;
  transfer: TransferApi;
  onClose: () => void;
}

const POLL_ATTEMPTS = 8;
const POLL_DELAY_MS = 450;

function deleteCachedPreview(uri: string | null) {
  if (!uri) return;
  void FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
}

async function pollForScreenshot(
  list: TransferApi['list'],
  existingNames: ReadonlySet<string>,
  signal: AbortSignal,
  isCurrent: () => boolean,
): Promise<WifiImportFileEntry | null> {
  for (let i = 0; i < POLL_ATTEMPTS && isCurrent(); i++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_DELAY_MS));
    if (!isCurrent()) return null;
    const after = await listAllScreenshots(list, signal);
    if (!isCurrent()) return null;
    const found = findLatestScreenshot(after, existingNames);
    if (found) return found;
  }
  return null;
}

async function captureScreenshotPreview(
  { transfer, signal, isCurrent }: { transfer: TransferApi; signal: AbortSignal; isCurrent: () => boolean },
  { canFetchImage, takeScreenshot, setNote, setFileName, setRemotePath, replacePreview, t }: {
    canFetchImage: boolean;
    takeScreenshot: () => Promise<void>;
    setNote: (note: string | null) => void;
    setFileName: (name: string) => void;
    setRemotePath: (path: string | null) => void;
    replacePreview: (uri: string | null) => void;
    t: ReturnType<typeof useI18n>['t'];
  },
) {
  let existingNames = new Set<string>();
  if (canFetchImage) {
    const before = await listAllScreenshots(transfer.list, signal);
    if (!isCurrent()) return;
    existingNames = new Set(before.map((e) => e.name));
  }
  await takeScreenshot();
  if (!isCurrent()) return;
  if (!canFetchImage) {
    setNote(t('Saved on the player SD card. Connect over Wi-Fi to view or download it.'));
    return;
  }
  const match = await pollForScreenshot(transfer.list, existingNames, signal, isCurrent);
  if (!isCurrent()) return;
  if (!match) {
    setNote(t('Could not confirm the new screenshot on the SD card.'));
    return;
  }
  const cacheUri = `${FileSystem.cacheDirectory ?? ''}compas_screenshot_${Date.now()}.png`;
  await transfer.download(match.path, cacheUri, () => {}, signal);
  if (!isCurrent()) {
    deleteCachedPreview(cacheUri);
    return;
  }
  setFileName(match.name);
  setRemotePath(match.path);
  replacePreview(cacheUri);
}

function useScreenshotActions({ visible, state, sessionKey, takeScreenshot, transfer }: Omit<ScreenshotSheetProps, 'onClose'>) {
  const { t } = useI18n();
  const snackbar = useSnackbar();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [remotePath, setRemotePath] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('screenshot.png');
  const [choosingDest, setChoosingDest] = useState(false);
  const previewUriRef = useRef<string | null>(null);
  const leaseRunner = useTransferLeaseRunner(transfer, sessionKey);

  const replacePreview = useCallback((nextUri: string | null) => {
    if (previewUriRef.current && previewUriRef.current !== nextUri) deleteCachedPreview(previewUriRef.current);
    previewUriRef.current = nextUri;
    setPreviewUri(nextUri);
  }, []);

  useEffect(() => () => {
    deleteCachedPreview(previewUriRef.current);
    previewUriRef.current = null;
  }, []);

  const canFetchImage =
    state.connectionTransport === ConnectionTransport.Wifi &&
    state.supportedFeatures.includes('wifi_import') &&
    state.supportedFeatures.includes('wifi_import_files');

  useEffect(() => {
    leaseRunner.abort();
    setBusy(false);
    setError(null);
    setNote(null);
    setChoosingDest(false);
    // A new session (or a closed sheet) may be a different player or SD card: the old screenshot path means nothing there.
    replacePreview(null);
    setRemotePath(null);
  }, [visible, sessionKey, leaseRunner, replacePreview]);

  const capture = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNote(null);
    replacePreview(null);
    setRemotePath(null);
    await leaseRunner.run(
      (ctx) => captureScreenshotPreview(ctx, { canFetchImage, takeScreenshot, setNote, setFileName, setRemotePath, replacePreview, t }),
      {
        acquireLease: canFetchImage,
        onError: (cause: unknown) => setError(transferErrorText(cause, 'Could not capture a screenshot.', t)),
        onFinally: () => setBusy(false),
      },
    );
  }, [busy, canFetchImage, leaseRunner, replacePreview, takeScreenshot, t]);

  const saveToFolder = useCallback(async (folderPath: string) => {
    setChoosingDest(false);
    if (!remotePath) return;
    setBusy(true);
    setError(null);
    await leaseRunner.run(async ({ transfer: activeTransfer, signal, isCurrent }) => {
      const targetPath = uniqueLocalPath(folderPath, fileName, localFileExists);
      await activeTransfer.download(remotePath, localFileUri(targetPath), () => {}, signal);
      if (!isCurrent()) return;
      snackbar.show({ text: t('Screenshot saved.') });
    }, {
      onError: (cause: unknown) => setError(transferErrorText(cause, 'Could not save the screenshot.', t)),
      onFinally: () => setBusy(false),
    });
  }, [fileName, leaseRunner, remotePath, snackbar, t]);

  return { t, busy, error, note, previewUri, remotePath, choosingDest, setChoosingDest, capture, saveToFolder };
}

export function ScreenshotSheet(props: ScreenshotSheetProps) {
  const { visible, onClose } = props;
  const { t, busy, error, note, previewUri, remotePath, choosingDest, setChoosingDest, capture, saveToFolder } = useScreenshotActions(props);

  return (
    <>
      <BottomSheet visible={visible} onClose={onClose}>
        <View style={styles.content}>
          <SheetStepTitle title={t('Player screenshot')} />
          {busy ? (
            <View style={styles.center}>
              <Spinner />
              <AppText variant="caption" tone="inkMuted">{t('Capturing screenshot…')}</AppText>
            </View>
          ) : null}
          {error ? <InlineError message={error} /> : null}
          {note ? <AppText variant="body" tone="inkMuted">{note}</AppText> : null}
          {previewUri ? (
            <Image source={{ uri: previewUri }} style={styles.preview} resizeMode="contain" />
          ) : null}
          <View style={styles.actions}>
            <Button
              label={previewUri ? t('Take another') : t('Take screenshot')}
              icon="playerScreen"
              disabled={busy}
              onPress={() => void capture()}
            />
            {previewUri && remotePath && isFileBrowsingAvailable() ? (
              <Button
                variant="container"
                icon="arrowDown"
                label={t('Save to device')}
                disabled={busy}
                onPress={() => setChoosingDest(true)}
              />
            ) : null}
          </View>
        </View>
      </BottomSheet>
      <LocalDestinationSheet
        visible={choosingDest}
        initialPath=""
        onClose={() => setChoosingDest(false)}
        onSave={(folder) => void saveToFolder(folder)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: Space.lg, gap: Space.md },
  center: { alignItems: 'center', gap: Space.sm, paddingVertical: Space.lg },
  preview: { width: '100%', height: 220, borderRadius: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm, justifyContent: 'flex-end' },
});
