import React, { useMemo, useState } from 'react';
import { Animated, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { between, CollapseProgress, fadeOnCollapse } from '../collapse';
import { formatPlaybackTime, formatRemainingTime } from '../playbackTime';
import { Space, Type } from '../tokens';
import { useInterpolatedPosition } from '../useInterpolatedPosition';
import { AppText } from './AppText';
import { PendingCaption } from './PendingCaption';
import { Slider } from './Slider';

export interface SeekBarProps {
  positionMs: number;
  durationMs: number;
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
const EXPANDED = new Animated.Value(0);

export function SeekBar({ positionMs, durationMs, playing, onSeek, disabled = false, collapse = EXPANDED, pendingLabel = null, style }: SeekBarProps) {
  const [dragFraction, setDragFraction] = useState<number | null>(null);
  const livePositionMs = useInterpolatedPosition(positionMs, durationMs, playing && dragFraction === null);
  const hasDuration = durationMs > 0;
  const shownMs = dragFraction !== null ? dragFraction * durationMs : livePositionMs;
  const fraction = hasDuration ? shownMs / durationMs : 0;

  const commit = (value: number) => {
    setDragFraction(null);
    if (hasDuration) onSeek(Math.round(value * durationMs));
  };

  const { touchHeight, timesHeight, timesOpacity } = useMemo(
    () => ({
      touchHeight: between(collapse, EXPANDED_TOUCH_HEIGHT, COLLAPSED_TOUCH_HEIGHT),
      timesHeight: between(collapse, TIMES_HEIGHT, 0),
      timesOpacity: fadeOnCollapse(collapse),
    }),
    [collapse],
  );

  return (
    <Animated.View style={style}>
      <Animated.View style={[styles.touchFrame, { height: touchHeight }]}>
        <Slider
          value={fraction}
          label="Seek"
          disabled={disabled || !hasDuration}
          formatValue={(value) => formatPlaybackTime(value * durationMs)}
          onChange={setDragFraction}
          onCommit={commit}
        />
      </Animated.View>
      <Animated.View style={[styles.times, { height: timesHeight, opacity: timesOpacity }]}>
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
