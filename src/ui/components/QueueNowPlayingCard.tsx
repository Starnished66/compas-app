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

export interface QueueNowPlayingCardProps {
  track: RemoteTrack;
  isPlaying: boolean;
  style?: StyleProp<ViewStyle>;
}

const ARTWORK_SIZE = 48;

export function QueueNowPlayingCard({ track, isPlaying, style }: QueueNowPlayingCardProps) {
  const palette = usePalette();
  const artist = track.artist || 'Unknown artist';
  const position = formatPlaybackTime(usePlaybackPosition().positionMs);

  return (
    <View
      accessible
      accessibilityLabel={`Now playing ${track.title}, ${artist}, ${position}`}
      style={[styles.card, { backgroundColor: palette.surfaceRaised }, style]}
    >
      <ArtworkThumb uri={track.artwork} size={ARTWORK_SIZE} />
      <View style={styles.meta}>
        <AppText variant="eyebrow" tone="accent">
          Now playing
        </AppText>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {track.title || 'Unknown song'}
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
