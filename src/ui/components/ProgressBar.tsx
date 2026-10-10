import React, { useEffect, useRef } from 'react';
import { Animated, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Easings, motionDuration } from '../motion';
import { usePalette } from '../PaletteProvider';
import { Radius } from '../tokens';
import { useReducedMotion } from '../useReducedMotion';

export interface ProgressBarProps {
  value: number;
  label?: string;
  color?: string;
  animated?: boolean;
  style?: StyleProp<ViewStyle>;
}

const BAR_HEIGHT = 4;
const FILL_TRANSITION_MS = 300;

export function ProgressBar({ value, label, color, animated = false, style }: ProgressBarProps) {
  const palette = usePalette();
  const reducedMotion = useReducedMotion();
  const clamped = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  const fill = useRef(new Animated.Value(clamped)).current;

  useEffect(() => {
    if (!animated) return;
    const animation = Animated.timing(fill, {
      toValue: clamped,
      duration: motionDuration(reducedMotion, FILL_TRANSITION_MS),
      easing: Easings.ease,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [animated, clamped, fill, reducedMotion]);

  const width = animated
    ? fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] })
    : (`${clamped * 100}%` as const);

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={[styles.track, { backgroundColor: palette.surfaceRaised }, style]}
    >
      <Animated.View style={[styles.fill, { width, backgroundColor: color ?? palette.accent }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: BAR_HEIGHT,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  fill: {
    height: BAR_HEIGHT,
    borderRadius: Radius.full,
  },
});
