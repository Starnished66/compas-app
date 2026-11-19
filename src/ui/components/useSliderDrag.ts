import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { Easing, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Durations, EasingCurves, motionDuration } from '../motion';

const growEasing = Easing.bezier(...EasingCurves.standard);

export function clampUnit(value: number): number {
  'worklet';
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function touchFraction(x: number, width: number, mirrored: boolean): number {
  'worklet';
  return (mirrored ? width - x : x) / width;
}

export function useSliderDrag(
  value: number,
  disabled: boolean,
  reducedMotion: boolean,
  mirrored: boolean,
  onChange: ((value: number) => void) | undefined,
  onCommit: (value: number) => void,
) {
  const [dragValue, setDragValue] = useState<number | null>(null);
  const [committedRelease, setCommittedRelease] = useState(0);
  const callbacks = useRef({ onChange, onCommit });
  callbacks.current = { onChange, onCommit };
  const preview = useCallback((next: number) => {
    setDragValue(next);
    callbacks.current.onChange?.(next);
  }, []);
  const commit = useCallback((next: number, release?: number) => {
    setDragValue(null);
    callbacks.current.onCommit(next);
    if (release !== undefined) setCommittedRelease(release);
  }, []);

  const width = useSharedValue(0);
  const controlled = useSharedValue({ value: clampUnit(value), release: 0 });
  const release = useSharedValue(0);
  const position = useSharedValue(0);
  const pointer = useSharedValue(-1);
  const offset = useSharedValue(0);
  const grow = useSharedValue(0);
  const fraction = useDerivedValue(() => {
    const current = controlled.value;
    return pointer.value !== -1 || release.value > current.release ? position.value : current.value;
  });
  const duration = motionDuration(reducedMotion, Durations.sliderGrow);

  // Publish the value and its release together after React applies the commit.
  useLayoutEffect(() => {
    controlled.value = { value: clampUnit(value), release: committedRelease };
  }, [controlled, committedRelease, value]);

  const gesture = useMemo(() => Gesture.Pan()
    .minDistance(0)
    .enabled(!disabled)
    .shouldCancelWhenOutside(false)
    .onTouchesDown(({ changedTouches }) => {
      if (pointer.value !== -1 || width.value <= 0) return;
      const touch = changedTouches[0];
      if (!touch) return;
      pointer.value = touch.id;
      offset.value = 0;
      position.value = clampUnit(touchFraction(touch.x, width.value, mirrored));
      grow.value = withTiming(1, { duration, easing: growEasing });
      scheduleOnRN(preview, position.value);
    })
    .onTouchesMove(({ changedTouches }) => {
      const touch = changedTouches.find(({ id }) => id === pointer.value);
      if (!touch || width.value <= 0) return;
      const next = clampUnit(touchFraction(touch.x, width.value, mirrored) + offset.value);
      if (position.value === next) return;
      position.value = next;
      scheduleOnRN(preview, next);
    })
    .onTouchesUp(({ allTouches, changedTouches }) => {
      const touch = changedTouches.find(({ id }) => id === pointer.value);
      if (!touch || width.value <= 0) return;
      // The touch snapshot can still include fingers lifted in this event.
      const remaining = allTouches.find(({ id }) => !changedTouches.some((lifted) => lifted.id === id));
      if (remaining) {
        offset.value = position.value - touchFraction(remaining.x, width.value, mirrored);
        pointer.value = remaining.id;
        return;
      }
      position.value = clampUnit(touchFraction(touch.x, width.value, mirrored) + offset.value);
    })
    .onFinalize(() => {
      if (pointer.value === -1) return;
      release.value += 1;
      pointer.value = -1;
      grow.value = withTiming(0, { duration, easing: growEasing });
      scheduleOnRN(commit, position.value, release.value);
    }), [commit, disabled, duration, grow, mirrored, offset, pointer, position, preview, release, width]);

  return { commit, dragValue, fraction, gesture, grow, width };
}
