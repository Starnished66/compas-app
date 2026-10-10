import React, { ReactNode, useLayoutEffect, useRef } from 'react';
import { Animated, StyleProp, ViewStyle } from 'react-native';
import { Distances, Durations, Easings } from '../motion';
import { useReducedMotion } from '../useReducedMotion';

export type PageTransitionKind = 'fade' | 'push' | 'pop';

export interface PageTransitionProps {
  transitionKey: string;
  kind: PageTransitionKind;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

function transformFor(kind: PageTransitionKind, progress: Animated.Value) {
  if (kind === 'fade') {
    return [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [Distances.pageFade, 0] }) }];
  }
  const start = kind === 'push' ? Distances.pagePush : -Distances.pagePush;
  return [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [start, 0] }) }];
}

export function PageTransition({ transitionKey, kind, style, children }: PageTransitionProps) {
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(1)).current;
  const previousKey = useRef(transitionKey);
  const animatedKind = useRef(kind);

  if (previousKey.current !== transitionKey) animatedKind.current = kind;

  useLayoutEffect(() => {
    if (previousKey.current === transitionKey) return;
    previousKey.current = transitionKey;
    if (reducedMotion) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: animatedKind.current === 'fade' ? Durations.pageFade : Durations.pagePush,
      easing: Easings.standard,
      useNativeDriver: true,
    }).start();
  }, [progress, reducedMotion, transitionKey]);

  return (
    <Animated.View style={[style, { opacity: progress, transform: transformFor(animatedKind.current, progress) }]}>
      {children}
    </Animated.View>
  );
}
