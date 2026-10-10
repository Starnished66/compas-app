import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import { Durations, Easings, motionDuration, staggerDelay } from './motion';
import { useReducedMotion } from './useReducedMotion';

export function useEditStagger(editing: boolean, index: number): Animated.Value {
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(editing ? 1 : 0)).current;

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: editing ? 1 : 0,
      duration: motionDuration(reducedMotion, Durations.editRow),
      delay: reducedMotion ? 0 : staggerDelay(index, Durations.editStagger, Durations.editStaggerMax),
      easing: Easings.standard,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [editing, index, progress, reducedMotion]);

  return progress;
}
