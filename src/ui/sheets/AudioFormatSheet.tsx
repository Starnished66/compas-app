import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ConnectionTransport, RemoteTrack } from '../../data/types';
import { describeAudioFormat } from '../audioFormat';
import { AppText } from '../components/AppText';
import { BottomSheet } from '../components/BottomSheet';
import { DetailRow } from '../components/DetailRow';
import { usePalette } from '../PaletteProvider';
import { Radius, Space } from '../tokens';

export interface AudioFormatSheetProps {
  visible: boolean;
  track: RemoteTrack | null | undefined;
  transport: ConnectionTransport;
  onClose: () => void;
}

const NOT_REPORTED = 'Not reported';

function routeDescription(transport: ConnectionTransport): string {
  return transport === ConnectionTransport.Bluetooth
    ? 'Bluetooth · the player reports every 5 s while it plays over Bluetooth audio'
    : 'Wi-Fi · the player reports about every 1.5 s';
}

export function AudioFormatSheet({ visible, track, transport, onClose }: AudioFormatSheetProps) {
  const palette = usePalette();
  const format = describeAudioFormat(track);

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Audio format">
      <View style={styles.body}>
        <View style={styles.summary}>
          <AppText variant="headline" tabular>
            {format?.line ?? NOT_REPORTED}
          </AppText>
          {format ? (
            <AppText variant="body" tone="inkMuted">
              {format.quality}
            </AppText>
          ) : null}
        </View>
        <View style={[styles.table, { borderColor: palette.outline }]}>
          <DetailRow
            label="Codec"
            value={format?.codec ? `${format.codec} · ${format.lossy ? 'Lossy' : 'Lossless'}` : NOT_REPORTED}
          />
          <DetailRow label="Bit depth" value={format?.bitDepth ?? NOT_REPORTED} divided />
          <DetailRow label="Sample rate" value={format?.sampleRate ?? NOT_REPORTED} divided />
          <DetailRow label="Connection" value={routeDescription(transport)} stacked divided />
        </View>
        <AppText variant="caption" tone="inkMuted">
          This is the format of the file, as the player reports it.
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
