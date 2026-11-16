import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { useI18n } from '../../i18n';
import { isTransferUnavailable } from '../../session/transferAvailability';
import { AppText } from '../components/AppText';
import { BottomSheet } from '../components/BottomSheet';
import { Button } from '../components/Button';
import { SheetStepTitle } from '../components/SheetStepTitle';
import type { TransferApi } from '../screens/TransferScreen';
import { Space } from '../tokens';
import { SdBrowserView } from '../transfer/SdBrowserView';
import { SdBrowser, useSdBrowser } from '../transfer/useSdBrowser';
import { useSheetStep } from './useSheetStep';

interface Props {
  visible: boolean;
  transfer: TransferApi;
  initialPath: string;
  initialShowHidden: boolean;
  seed: Pick<SdBrowser, 'entries' | 'nextOffset'>;
  itemCount: number;
  available: boolean;
  onClose: (created: boolean) => void;
  onUnavailable: () => void;
  onSave: (path: string, created: boolean) => void;
}

export function TransferDestinationSheet(props: Props) {
  const session = useRef({ created: false, closing: false, pending: null as Promise<void> | null });
  const { step, sheetKey } = useSheetStep(props.visible, 'destination', () => {
    session.current = { created: false, closing: false, pending: null };
  });
  // Unmounting ends the session, so a pending close cannot call an old parent.
  useEffect(() => () => { session.current = { created: false, closing: false, pending: null }; }, []);
  const current = session.current;
  const latest = useRef(props);
  latest.current = props;
  const close = async (path?: string) => {
    if (current.closing) return;
    current.closing = true;
    await current.pending?.catch(() => {});
    if (session.current !== current || !latest.current.visible || !latest.current.available) return;
    if (path === undefined) latest.current.onClose(current.created);
    else latest.current.onSave(path, current.created);
  };
  const transfer = { ...props.transfer, mkdir: (path: string, name: string) => {
    current.pending = props.transfer.mkdir(path, name).then(() => { current.created = true; });
    return current.pending;
  } };
  return (
    <BottomSheet key={sheetKey} visible={props.visible} onClose={() => void close()} contentKey={step} scrollable={false} fullHeight>
      <DestinationBrowser {...props} transfer={transfer} onClose={() => void close()} onSave={(path) => void close(path)} />
    </BottomSheet>
  );
}

function DestinationBrowser({ visible, transfer, initialPath, initialShowHidden, seed, itemCount, available, onClose, onUnavailable, onSave }: Props) {
  const { t } = useI18n();
  const browser = useSdBrowser(transfer, initialPath, (cause) => {
    if (visible && isTransferUnavailable(cause)) onUnavailable();
  }, seed, initialShowHidden);
  const { load, reset } = browser;
  const openingPath = useRef(initialPath);
  useEffect(() => {
    if (!visible) return;
    // The seed is for display; this browser validates the folder itself.
    void load(openingPath.current);
    return reset;
  }, [visible, load, reset]);
  const transferRef = useRef(transfer);
  transferRef.current = transfer;
  useEffect(() => {
    if (!visible) return;
    let closed = false;
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      await transferRef.current.refresh();
      if (!closed) timer = setTimeout(() => void check(), 2000);
    };
    void check();
    return () => { closed = true; clearTimeout(timer); };
  }, [visible]);
  useEffect(() => {
    if (visible && !available) onUnavailable();
  }, [visible, available, onUnavailable]);
  return (
    <>
      <SheetStepTitle title={t('Save to folder')} />
      <AppText variant="caption" tone="inkMuted" style={styles.summary}>{t('{count} selected', { count: itemCount })}</AppText>
      <SdBrowserView browser={browser} canBrowse={visible && available} canMutate={visible && available} foldersOnly />
      <View style={styles.actions}>
        <Button variant="plain" label={t('Cancel')} onPress={() => onClose(false)} />
        <Button label={t('Save here')} disabled={!visible || !available || !browser.loaded || browser.loading || !!browser.error || !!browser.editing} onPress={() => onSave(browser.path, false)} />
      </View>
    </>
  );
}
const styles = StyleSheet.create({
  summary: { paddingHorizontal: Space.lg, paddingBottom: Space.sm },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Space.sm, paddingHorizontal: Space.lg, paddingTop: Space.sm },
});
