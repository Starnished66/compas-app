import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleProp, ViewStyle } from 'react-native';
import { usePalette } from '../PaletteProvider';
import { useReducedMotion } from '../useReducedMotion';

export interface SpinnerProps {
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}

const SPIN_DURATION_MS = 800;

export function Spinner({ size = 18, color, style }: SpinnerProps) {
  const palette = usePalette();
  const reducedMotion = useReducedMotion();
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducedMotion) return;
    const loop = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: SPIN_DURATION_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => {
      loop.stop();
      rotation.setValue(0);
    };
  }, [reducedMotion, rotation]);

  const ringColor = color ?? palette.inkMuted;
  const rotate = rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <Animated.View
      accessibilityRole="progressbar"
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 2,
          borderColor: ringColor,
          borderTopColor: 'transparent',
          transform: [{ rotate }],
        },
        style,
      ]}
    />
  );
}
