import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { RemoteTrack } from '../../data/types';
import { usePalette } from '../PaletteProvider';
import { formatPlaybackTime } from '../playbackTime';
import { Radius, Space } from '../tokens';
import { usePlaybackPosition } from '../usePlaybackPosition';
import { AppText } from './AppText';
import { ArtworkThumb } from './ArtworkThumb';
import { PlayingIndicator } from './PlayingIndicator';
import { useI18n } from '../../i18n';

export interface QueueNowPlayingCardProps {
  track: RemoteTrack;
  isPlaying: boolean;
  style?: StyleProp<ViewStyle>;
}

const ARTWORK_SIZE = 48;

export function QueueNowPlayingCard({ track, isPlaying, style }: QueueNowPlayingCardProps) {
  const { t } = useI18n();
  const palette = usePalette();
  const artist = track.artist || t('Unknown artist');
  const position = formatPlaybackTime(usePlaybackPosition().positionMs);

  return (
    <View
      accessible
      accessibilityLabel={t('Now playing {title}, {artist}, {position}', { title: track.title, artist, position })}
      style={[styles.card, { backgroundColor: palette.surfaceRaised }, style]}
    >
      <ArtworkThumb uri={track.artwork} size={ARTWORK_SIZE} />
      <View style={styles.meta}>
        <AppText variant="eyebrow" tone="accent">
          {t('Now playing')}
        </AppText>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {track.title || t('Unknown song')}
        </AppText>
        <AppText variant="caption" tone="inkMuted" tabular numberOfLines={1}>
          {`${artist} · ${position}`}
        </AppText>
      </View>
      <PlayingIndicator playing={isPlaying} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
    borderRadius: Radius.lg,
  },
  meta: {
    flex: 1,
    minWidth: 0,
  },
});
