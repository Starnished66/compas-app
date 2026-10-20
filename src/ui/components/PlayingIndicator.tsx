import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { usePalette } from '../PaletteProvider';
import { useReducedMotion } from '../useReducedMotion';
import { useI18n } from '../../i18n';

export interface PlayingIndicatorProps {
  playing?: boolean;
  color?: string;
  style?: StyleProp<ViewStyle>;
}

const BARS = [
  { left: 1, durationMs: 900, phase: 0 },
  { left: 6.5, durationMs: 700, phase: 0.43 },
  { left: 12, durationMs: 1100, phase: 0.55 },
];
const LOW_SCALE = 0.35;
const PAUSED_SCALE = 0.45;
const EASED_STEPS = [0, 0.125, 0.5, 0.875, 1];
const SCALE_INPUT = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];
const SCALE_OUTPUT = [...EASED_STEPS, ...EASED_STEPS.slice(0, -1).reverse()].map(
  (eased) => LOW_SCALE + (1 - LOW_SCALE) * eased,
);

function barScale(progress: Animated.Value, phase: number) {
  return Animated.modulo(Animated.add(progress, phase), 1).interpolate({
    inputRange: SCALE_INPUT,
    outputRange: SCALE_OUTPUT,
  });
}

export function PlayingIndicator({ playing = true, color, style }: PlayingIndicatorProps) {
  const { t } = useI18n();
  const palette = usePalette();
  const reducedMotion = useReducedMotion();
  const animate = playing && !reducedMotion;
  const progress = useRef(BARS.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    if (!animate) return;
    const loops = BARS.map((bar, index) =>
      Animated.loop(
        Animated.timing(progress[index], {
          toValue: 1,
          duration: bar.durationMs,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ),
    );
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [animate, progress]);

  const fill = color ?? palette.accent;

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={t('Now playing')} style={[styles.box, style]}>
      {BARS.map((bar, index) => (
        <Animated.View
          key={bar.left}
          style={[
            styles.bar,
            {
              left: bar.left,
              backgroundColor: fill,
              transform: [{ scaleY: animate ? barScale(progress[index], bar.phase) : PAUSED_SCALE }],
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    width: 16,
    height: 16,
  },
  bar: {
    position: 'absolute',
    bottom: 2,
    width: 3,
    height: 12,
    borderRadius: 1,
    transformOrigin: 'bottom',
  },
});
