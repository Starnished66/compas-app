import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { RemoteTrack } from '../../data/types';
import { ColorScheme } from '../theme';
import { Artwork } from './Artwork';
import { Glyph } from './Glyph';
import { FrostedLayer } from './CardSurface';

export interface MiniPlayerBarProps {
  track: RemoteTrack;
  isPlaying: boolean;
  colors: ColorScheme;
  onOpenHome: () => void;
  onTogglePlayback: () => void;
  onPrevious: () => void;
  onNext: () => void;
}

export const MiniPlayerBar: React.FC<MiniPlayerBarProps> = ({
  track,
  isPlaying,
  colors,
  onOpenHome,
  onTogglePlayback,
  onPrevious,
  onNext,
}) => {
  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: 'transparent',
          borderTopColor: colors.outline,
        },
      ]}
    >
      <FrostedLayer colors={colors} />
      <TouchableOpacity
        style={styles.infoArea}
        onPress={onOpenHome}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`Now playing ${track.title}, ${track.artist}. Open player`}
      >
        <Artwork
          uri={track.artwork}
          colors={colors}
          size={48}
          borderRadius={8}
        />
        <View style={styles.textContainer}>
          <Text
            style={[styles.title, { color: colors.onSurface }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {track.title || 'Compás Player'}
          </Text>
          <Text
            style={[styles.artist, { color: colors.onSurfaceVariant }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {track.artist || 'Unknown artist'}
          </Text>
        </View>
      </TouchableOpacity>

      <View style={styles.controls}>
        <TouchableOpacity
          style={styles.navButton}
          onPress={onPrevious}
          accessibilityRole="button"
          accessibilityLabel="Previous track"
        >
          <Glyph name="previous" size={18} tint={colors.onSurface} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.playButton, { backgroundColor: colors.primary }]}
          onPress={onTogglePlayback}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
        >
          <Glyph
            name={isPlaying ? 'pause' : 'play'}
            size={18}
            tint={colors.onPrimary}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navButton}
          onPress={onNext}
          accessibilityRole="button"
          accessibilityLabel="Next track"
        >
          <Glyph name="next" size={18} tint={colors.onSurface} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  infoArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  textContainer: {
    flex: 1,
    marginLeft: 10,
    marginRight: 6,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
  },
  artist: {
    fontSize: 12,
    marginTop: 2,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  navButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
  },
});
