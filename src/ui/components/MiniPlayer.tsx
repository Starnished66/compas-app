import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { RemoteTrack } from '../../data/types';
import { usePalette } from '../PaletteProvider';
import { MiniProgressStyle } from '../miniProgress';
import { Durations, Easings, motionDuration } from '../motion';
import { recordSkip } from '../skipDirection';
import { Radius, Size, Space } from '../tokens';
import { trackKey } from '../trackKey';
import { usePlayGlyphSwap } from '../usePlayGlyphSwap';
import { useReducedMotion } from '../useReducedMotion';
import { useTrackChangeMotion } from '../useTrackChangeMotion';
import { AppText } from './AppText';
import { ArtworkThumb } from './ArtworkThumb';
import { CardComet } from './CardComet';
import { FrostFill } from './FrostFill';
import { IconButton } from './IconButton';
import { PlayButtonRing } from './PlayButtonRing';
import { ProgressBar } from './ProgressBar';

export interface MiniPlayerProps {
  track: RemoteTrack;
  isPlaying: boolean;
  progress: number;
  progressStyle: MiniProgressStyle;
  onOpen: () => void;
  onTogglePlayback: () => void;
  onPrevious: () => void;
  onNext: () => void;
  style?: StyleProp<ViewStyle>;
}

const SKIP_ICON_SIZE = 20;
const PLAY_ICON_SIZE = 18;
const PROGRESS_LINE_HEIGHT = 2;
const PLAY_BUTTON_MARGIN = 10;
const ENTER_OFFSET = 16;
const BAR_BORDER = 1;

export function MiniPlayer({
  track,
  isPlaying,
  progress,
  progressStyle,
  onOpen,
  onTogglePlayback,
  onPrevious,
  onNext,
  style,
}: MiniPlayerProps) {
  const palette = usePalette();
  const title = track.title || 'Unknown song';
  const artist = track.artist || 'Unknown artist';
  const { artStyle, metaStyle } = useTrackChangeMotion(track);
  const glyphStyle = usePlayGlyphSwap(isPlaying);
  const reducedMotion = useReducedMotion();
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: motionDuration(reducedMotion, Durations.miniPlayerEnter),
      easing: Easings.standard,
      useNativeDriver: true,
    }).start();
  }, [enter, reducedMotion]);

  const skip = (direction: -1 | 1, command: () => void) => {
    recordSkip(direction, trackKey(track));
    command();
  };

  const enterStyle = {
    opacity: enter,
    transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [ENTER_OFFSET, 0] }) }],
  };

  return (
    <Animated.View style={[enterStyle, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Now playing ${title}, ${artist}. Open player`}
        onPress={onOpen}
        style={[
          styles.bar,
          progressStyle === 'bar' && styles.clipped,
          { borderColor: palette.outline },
        ]}
      >
        <FrostFill radius={Radius.lg - BAR_BORDER} />
        <Animated.View style={artStyle}>
          <ArtworkThumb uri={track.artwork} size={Size.rowArtwork} />
        </Animated.View>
        <Animated.View style={[styles.meta, metaStyle]}>
          <AppText variant="bodyStrong" numberOfLines={1}>
            {title}
          </AppText>
          <AppText variant="caption" tone="inkMuted" numberOfLines={1}>
            {artist}
          </AppText>
        </Animated.View>
        <IconButton
          icon="skipPrevious"
          label="Previous"
          size="sm"
          iconSize={SKIP_ICON_SIZE}
          onPress={() => skip(-1, onPrevious)}
        />
        <View style={styles.playButton}>
          <IconButton
            icon={isPlaying ? 'pause' : 'play'}
            label={isPlaying ? 'Pause' : 'Play'}
            size="sm"
            variant="container"
            iconSize={PLAY_ICON_SIZE}
            iconStyle={glyphStyle}
            onPress={onTogglePlayback}
          />
          {progressStyle === 'ring' ? (
            <PlayButtonRing track={track} progress={progress} playing={isPlaying} buttonSize={Size.controlSm} />
          ) : null}
        </View>
        <IconButton icon="skipNext" label="Next" size="sm" iconSize={SKIP_ICON_SIZE} onPress={() => skip(1, onNext)} />
        {progressStyle === 'bar' ? <ProgressBar value={progress} label="Song progress" style={styles.progress} /> : null}
      </Pressable>
      {progressStyle === 'card' ? (
        <CardComet track={track} progress={progress} playing={isPlaying} radius={Radius.lg} />
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: Size.bar,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingLeft: Space.sm,
    paddingRight: Space.xs,
    borderWidth: BAR_BORDER,
    borderRadius: Radius.lg,
  },
  clipped: {
    overflow: 'hidden',
  },
  meta: {
    flex: 1,
    minWidth: 0,
  },
  playButton: {
    marginHorizontal: PLAY_BUTTON_MARGIN,
  },
  progress: {
    position: 'absolute',
    left: Space.md,
    right: Space.md,
    bottom: 0,
    height: PROGRESS_LINE_HEIGHT,
    borderRadius: 0,
  },
});
