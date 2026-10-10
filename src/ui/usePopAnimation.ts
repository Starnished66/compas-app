import { useEffect, useMemo, useRef } from 'react';
import { Animated } from 'react-native';
import { Durations, Easings } from './motion';
import { useReducedMotion } from './useReducedMotion';

const POP_FROM = 0.8;
const POP_PEAK = 1.12;
const POP_PEAK_AT = 0.45;

export function usePopAnimation(trigger: unknown) {
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(1)).current;
  const previousTrigger = useRef(trigger);

  useEffect(() => {
    if (Object.is(previousTrigger.current, trigger)) return;
    previousTrigger.current = trigger;
    if (reducedMotion) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: Durations.pop,
      easing: Easings.standard,
      useNativeDriver: true,
    }).start();
  }, [progress, reducedMotion, trigger]);

  return useMemo(
    () => ({
      transform: [
        {
          scale: progress.interpolate({
            inputRange: [0, POP_PEAK_AT, 1],
            outputRange: [POP_FROM, POP_PEAK, 1],
          }),
        },
      ],
    }),
    [progress],
  );
}
