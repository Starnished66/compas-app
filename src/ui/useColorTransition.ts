import { useEffect, useMemo, useRef } from 'react';
import { Animated } from 'react-native';
import { Easings } from './motion';
import { useReducedMotion } from './useReducedMotion';

export function useColorTransition(color: string, duration: number) {
  const reducedMotion = useReducedMotion();
  const previousColor = useRef(color);

  const transition = useMemo(() => {
    const progress = new Animated.Value(0);
    return {
      progress,
      color: progress.interpolate({ inputRange: [0, 1], outputRange: [previousColor.current, color] }),
    };
  }, [color]);

  useEffect(() => {
    previousColor.current = color;
    if (reducedMotion) {
      transition.progress.setValue(1);
      return;
    }
    const animation = Animated.timing(transition.progress, {
      toValue: 1,
      duration,
      easing: Easings.ease,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [color, duration, reducedMotion, transition]);

  return transition.color;
}
