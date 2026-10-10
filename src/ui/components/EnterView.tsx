import React, { ReactNode, useEffect, useRef } from 'react';
import { Animated, StyleProp, ViewProps, ViewStyle } from 'react-native';
import { Distances, Durations, Easings, staggerDelay } from '../motion';
import { useReducedMotion } from '../useReducedMotion';

export interface EnterViewProps extends Omit<ViewProps, 'style'> {
  from?: 'up' | 'down';
  index?: number;
  delay?: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

export function EnterView({ from = 'up', index = 0, delay = 0, style, children, ...rest }: EnterViewProps) {
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reducedMotion) {
      progress.setValue(1);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: Durations.enter,
      delay: staggerDelay(index, Durations.enterStagger, Durations.enterStaggerMax) + delay,
      easing: Easings.standard,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, reducedMotion]);

  const offset = from === 'up' ? Distances.enter : -Distances.enter;
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [offset, 0] });

  return (
    <Animated.View {...rest} style={[style, { opacity: progress, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}
