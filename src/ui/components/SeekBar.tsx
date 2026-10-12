import React, { useState } from 'react';
import { StyleProp, StyleSheet, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { between, CollapseProgress, fadeOnCollapse } from '../collapse';
import { formatPlaybackTime, formatRemainingTime } from '../playbackTime';
import { Space, Type } from '../tokens';
import { useInterpolatedPosition } from '../useInterpolatedPosition';
import { usePlaybackPosition } from '../usePlaybackPosition';
import { AppText } from './AppText';
import { PendingCaption } from './PendingCaption';
import { Slider } from './Slider';

export interface SeekBarProps {
  playing: boolean;
  onSeek: (positionMs: number) => void;
  disabled?: boolean;
  collapse?: CollapseProgress;
  pendingLabel?: string | null;
  style?: StyleProp<ViewStyle>;
}

const EXPANDED_TOUCH_HEIGHT = 24;
const COLLAPSED_TOUCH_HEIGHT = 12;
const TIMES_HEIGHT = Type.caption.lineHeight;

export function SeekBar({ playing, onSeek, disabled = false, collapse, pendingLabel = null, style }: SeekBarProps) {
  const { positionMs, durationMs } = usePlaybackPosition();
  const [dragFraction, setDragFraction] = useState<number | null>(null);
  const livePositionMs = useInterpolatedPosition(positionMs, durationMs, playing && dragFraction === null);
  const hasDuration = durationMs > 0;
  const shownMs = dragFraction !== null ? dragFraction * durationMs : livePositionMs;
  const fraction = hasDuration ? shownMs / durationMs : 0;

  const commit = (value: number) => {
    setDragFraction(null);
    if (hasDuration) onSeek(Math.round(value * durationMs));
  };

  const expanded = useSharedValue(0);
  const progress = collapse ?? expanded;
  const touchStyle = useAnimatedStyle(() => ({
    height: between(progress.value, EXPANDED_TOUCH_HEIGHT, COLLAPSED_TOUCH_HEIGHT),
  }));
  const timesStyle = useAnimatedStyle(() => ({
    height: between(progress.value, TIMES_HEIGHT, 0),
    opacity: fadeOnCollapse(progress.value),
  }));

  return (
    <Animated.View style={style}>
      <Animated.View style={[styles.touchFrame, touchStyle]}>
        <Slider
          value={fraction}
          label="Seek"
          disabled={disabled || !hasDuration}
          formatValue={(value) => formatPlaybackTime(value * durationMs)}
          onChange={setDragFraction}
          onCommit={commit}
        />
      </Animated.View>
      <Animated.View style={[styles.times, timesStyle]}>
        <AppText variant="caption" tone="inkMuted" tabular>
          {formatPlaybackTime(shownMs)}
        </AppText>
        <PendingCaption label={pendingLabel} />
        <AppText variant="caption" tone="inkMuted" tabular>
          {hasDuration ? formatRemainingTime(shownMs, durationMs) : ''}
        </AppText>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  touchFrame: {
    justifyContent: 'center',
  },
  times: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Space.sm,
    overflow: 'hidden',
  },
});
