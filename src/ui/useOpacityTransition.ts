import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import { Easings, motionDuration } from './motion';
import { useReducedMotion } from './useReducedMotion';

export function useOpacityTransition(dimmed: boolean, dimmedOpacity: number, duration: number): Animated.Value {
  const reducedMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(dimmed ? dimmedOpacity : 1)).current;

  useEffect(() => {
    const animation = Animated.timing(opacity, {
      toValue: dimmed ? dimmedOpacity : 1,
      duration: motionDuration(reducedMotion, duration),
      easing: Easings.ease,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [dimmed, dimmedOpacity, duration, opacity, reducedMotion]);

  return opacity;
}
