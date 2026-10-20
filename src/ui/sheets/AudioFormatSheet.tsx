import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ConnectionTransport, RemoteTrack } from '../../data/types';
import { describeAudioFormat } from '../audioFormat';
import { AppText } from '../components/AppText';
import { BottomSheet } from '../components/BottomSheet';
import { DetailRow } from '../components/DetailRow';
import { usePalette } from '../PaletteProvider';
import { Radius, Space } from '../tokens';
import { useI18n } from '../../i18n';

export interface AudioFormatSheetProps {
  visible: boolean;
  track: RemoteTrack | null | undefined;
  transport: ConnectionTransport;
  onClose: () => void;
}

export function AudioFormatSheet({ visible, track, transport, onClose }: AudioFormatSheetProps) {
  const { t } = useI18n();
  const palette = usePalette();
  const format = describeAudioFormat(track);
  const notReported = t('Not reported');
  const routeDescription = transport === ConnectionTransport.Bluetooth
    ? t('Bluetooth · the player reports every 5 s while it plays over Bluetooth audio')
    : t('Wi-Fi · the player reports about every 1.5 s');

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('Audio format')}>
      <View style={styles.body}>
        <View style={styles.summary}>
          <AppText variant="headline" tabular>
            {format?.line ?? notReported}
          </AppText>
          {format ? (
            <AppText variant="body" tone="inkMuted">
              {format.quality}
            </AppText>
          ) : null}
        </View>
        <View style={[styles.table, { borderColor: palette.outline }]}>
          <DetailRow
            label={t('Codec')}
            value={format?.codec ? `${format.codec} · ${format.lossy ? t('Lossy') : t('Lossless')}` : notReported}
          />
          <DetailRow label={t('Bit depth')} value={format?.bitDepth ?? notReported} divided />
          <DetailRow label={t('Sample rate')} value={format?.sampleRate ?? notReported} divided />
          <DetailRow label={t('Connection')} value={routeDescription} stacked divided />
        </View>
        <AppText variant="caption" tone="inkMuted">
          {t('This is the format of the file, as the player reports it.')}
        </AppText>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: Space.md,
    paddingHorizontal: Space.lg,
    paddingBottom: Space.sm,
  },
  summary: {
    gap: Space.xs,
  },
  table: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
});
