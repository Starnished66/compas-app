import React, { ReactNode } from 'react';
import { Animated, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { PlaybackMode } from '../../data/types';
import { isShuffleMode } from '../../session/playbackModes';
import { Size, Space } from '../tokens';
import { usePlayGlyphSwap } from '../usePlayGlyphSwap';
import { usePopAnimation } from '../usePopAnimation';
import { IconButton } from './IconButton';
import { IconName } from './iconPaths';
import { useI18n } from '../../i18n';

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

function repeatPresentation(mode: PlaybackMode | undefined, t: (source: string) => string): { icon: IconName; label: string; active: boolean } {
  switch (mode) {
    case PlaybackMode.RepeatAll:
      return { icon: 'repeat', label: t('Repeating the queue'), active: true };
    case PlaybackMode.RepeatOne:
      return { icon: 'repeatOne', label: t('Repeating this song'), active: true };
    case PlaybackMode.ShuffleRepeat:
      return { icon: 'repeat', label: t('Repeating the queue'), active: true };
    default:
      return { icon: 'repeat', label: t('Repeat off'), active: false };
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
  const { t } = useI18n();
  const playLabel = t(isPlaying ? 'Pause' : 'Play');
  const playIcon: IconName = isPlaying ? 'pause' : 'play';
  const glyphStyle = usePlayGlyphSwap(isPlaying);
  const shuffleOn = playbackMode != null && isShuffleMode(playbackMode);
  const repeat = repeatPresentation(playbackMode, t);
  const shufflePop = usePopAnimation(shuffleOn);
  const repeatPop = usePopAnimation(repeat.icon + repeat.active);

  if (variant === 'compact') {
    return (
      <View style={[styles.compactRow, style]}>
        <IconButton icon="skipPrevious" label={t('Previous')} onPress={onPrevious} disabled={disabled} />
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
        <IconButton icon="skipNext" label={t('Next')} onPress={onNext} disabled={disabled} />
      </View>
    );
  }

  return (
    <View style={[styles.fullRow, spread ? styles.spread : styles.centered, style]}>
      {onToggleShuffle ? (
        <Animated.View style={shufflePop}>
          <IconButton
            icon={shuffleOn ? 'shuffle' : 'inOrder'}
            label={t(shuffleOn ? 'Shuffle on' : 'Playing in order. Turn shuffle on')}
            active={shuffleOn}
            iconStrokeWidth={shuffleOn ? ACTIVE_STROKE_WIDTH : undefined}
            onPress={onToggleShuffle}
            disabled={disabled}
          />
        </Animated.View>
      ) : null}
      <IconButton icon="skipPrevious" label={t('Previous')} variant="raised" onPress={onPrevious} disabled={disabled} />
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
      <IconButton icon="skipNext" label={t('Next')} variant="raised" onPress={onNext} disabled={disabled} />
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
    alignSelf: 'center',
    width: '100%',
    maxWidth: Size.controlMd * 4 + Size.controlLg + Space.lg * 4,
    justifyContent: 'space-between',
  },
  spread: {
    justifyContent: 'space-between',
  },
});
