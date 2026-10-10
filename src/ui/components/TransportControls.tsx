import React, { ReactNode } from 'react';
import { Animated, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { PlaybackMode } from '../../data/types';
import { Space } from '../tokens';
import { usePlayGlyphSwap } from '../usePlayGlyphSwap';
import { usePopAnimation } from '../usePopAnimation';
import { IconButton } from './IconButton';
import { IconName } from './iconPaths';

export interface TransportControlsProps {
  isPlaying: boolean;
  playbackMode?: PlaybackMode;
  onTogglePlayback: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onToggleShuffle?: () => void;
  onCycleRepeat?: () => void;
  variant?: 'full' | 'compact';
  spread?: boolean;
  disabled?: boolean;
  pending?: boolean;
  playRing?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

const ACTIVE_STROKE_WIDTH = 2;
const COMPACT_PLAY_ICON_SIZE = 20;

function repeatPresentation(mode: PlaybackMode | undefined): { icon: IconName; label: string; active: boolean } {
  switch (mode) {
    case PlaybackMode.RepeatAll:
      return { icon: 'repeat', label: 'Repeating the queue', active: true };
    case PlaybackMode.RepeatOne:
      return { icon: 'repeatOne', label: 'Repeating this song', active: true };
    default:
      return { icon: 'repeat', label: 'Repeat off', active: false };
  }
}

export function TransportControls({
  isPlaying,
  playbackMode,
  onTogglePlayback,
  onPrevious,
  onNext,
  onToggleShuffle,
  onCycleRepeat,
  variant = 'full',
  spread = false,
  disabled = false,
  pending = false,
  playRing,
  style,
}: TransportControlsProps) {
  const playLabel = isPlaying ? 'Pause' : 'Play';
  const playIcon: IconName = isPlaying ? 'pause' : 'play';
  const glyphStyle = usePlayGlyphSwap(isPlaying);
  const shuffleOn = playbackMode === PlaybackMode.Shuffle;
  const repeat = repeatPresentation(playbackMode);
  const shufflePop = usePopAnimation(shuffleOn);
  const repeatPop = usePopAnimation(repeat.icon + repeat.active);

  if (variant === 'compact') {
    return (
      <View style={[styles.compactRow, style]}>
        <IconButton icon="skipPrevious" label="Previous" onPress={onPrevious} disabled={disabled} />
        <View>
          <IconButton
            icon={playIcon}
            label={playLabel}
            variant="accent"
            iconSize={COMPACT_PLAY_ICON_SIZE}
            iconStyle={glyphStyle}
            onPress={onTogglePlayback}
            disabled={disabled}
            busy={pending}
          />
          {playRing}
        </View>
        <IconButton icon="skipNext" label="Next" onPress={onNext} disabled={disabled} />
      </View>
    );
  }

  return (
    <View style={[styles.fullRow, spread ? styles.spread : styles.centered, style]}>
      {onToggleShuffle ? (
        <Animated.View style={shufflePop}>
          <IconButton
            icon={shuffleOn ? 'shuffle' : 'inOrder'}
            label={shuffleOn ? 'Shuffle on' : 'Playing in order. Turn shuffle on'}
            active={shuffleOn}
            iconStrokeWidth={shuffleOn ? ACTIVE_STROKE_WIDTH : undefined}
            onPress={onToggleShuffle}
            disabled={disabled}
          />
        </Animated.View>
      ) : null}
      <IconButton icon="skipPrevious" label="Previous" variant="raised" onPress={onPrevious} disabled={disabled} />
      <IconButton
        icon={playIcon}
        label={playLabel}
        size="lg"
        variant="accent"
        iconStyle={glyphStyle}
        onPress={onTogglePlayback}
        disabled={disabled}
        busy={pending}
      />
      <IconButton icon="skipNext" label="Next" variant="raised" onPress={onNext} disabled={disabled} />
      {onCycleRepeat ? (
        <Animated.View style={repeatPop}>
          <IconButton
            icon={repeat.icon}
            label={repeat.label}
            active={repeat.active}
            iconStrokeWidth={repeat.active ? ACTIVE_STROKE_WIDTH : undefined}
            onPress={onCycleRepeat}
            disabled={disabled}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  fullRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  centered: {
    justifyContent: 'center',
    gap: Space.lg,
  },
  spread: {
    justifyContent: 'space-between',
  },
});
