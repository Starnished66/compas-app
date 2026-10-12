import { useEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';
import { Durations, Easings, motionDuration, staggerDelay } from './motion';
import { useReducedMotion } from './useReducedMotion';

export function editRange(progress: Animated.Value, from: number, to: number) {
  return progress.interpolate({ inputRange: [0, 1], outputRange: [from, to] });
}

export function useEditStagger(editing: boolean, index: number): Animated.Value {
  const reducedMotion = useReducedMotion();
  const [progress] = useState(() => new Animated.Value(editing ? 1 : 0));
  const shownEditing = useRef(editing);
  const latest = useRef({ index, reducedMotion });
  latest.current = { index, reducedMotion };

  useEffect(() => {
    if (shownEditing.current === editing) return;
    shownEditing.current = editing;
    const { index: staggerIndex, reducedMotion: reduced } = latest.current;
    const animation = Animated.timing(progress, {
      toValue: editing ? 1 : 0,
      duration: motionDuration(reduced, Durations.editRow),
      delay: reduced ? 0 : staggerDelay(staggerIndex, Durations.editStagger, Durations.editStaggerMax),
      easing: Easings.standard,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [editing, progress]);

  return progress;
}
