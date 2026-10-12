import React, { useEffect, useMemo } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { COMET_SEGMENT_COUNT } from '../cometSegments';
import { pointOnPerimeter, roundedRectPerimeter } from '../roundedRectPerimeter';
import { ProgressLaps } from '../useProgressLaps';
import { useReducedMotion } from '../useReducedMotion';
import { ProgressCometSegment } from './ProgressCometSegment';

export interface ProgressCometProps {
  width: number;
  height: number;
  radius: number;
  laps: ProgressLaps;
  playing: boolean;
  color: string;
  trackColor: string;
  trackOpacity: number;
  headOpacity?: number;
  headSize: number;
  label?: string;
  style?: StyleProp<ViewStyle>;
}

const STROKE_WIDTH = 2;
const LEAD_SEGMENT_OPACITY = 0.15;
const SEGMENT_OPACITY = 0.12;
const GLOW_SCALE = 2.4;
const GLOW_OPACITY = 0.28;
const BREATHE_MS = 1200;
const BREATHE_MIN = 0.3;
const BREATHE_EASING = Easing.bezier(0.42, 0, 0.58, 1);
const SEGMENT_INDICES = Array.from({ length: COMET_SEGMENT_COUNT }, (_, index) => index);

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function cometGlowPad(headSize: number): number {
  return Math.ceil((headSize * GLOW_SCALE) / 2);
}

function useBreathing(active: boolean) {
  const reducedMotion = useReducedMotion();
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (!active || reducedMotion) {
      cancelAnimation(opacity);
      opacity.value = 1;
      return;
    }
    const breathe = (toValue: number) => withTiming(toValue, { duration: BREATHE_MS, easing: BREATHE_EASING });
    opacity.value = withRepeat(withSequence(breathe(BREATHE_MIN), breathe(1)), -1);
  }, [active, opacity, reducedMotion]);

  return opacity;
}

export function ProgressComet({
  width,
  height,
  radius,
  laps,
  playing,
  color,
  trackColor,
  trackOpacity,
  headOpacity = 1,
  headSize,
  label,
  style,
}: ProgressCometProps) {
  const perimeter = useMemo(
    () => roundedRectPerimeter({ width, height, radius, strokeWidth: STROKE_WIDTH }),
    [height, radius, width],
  );
  const breathing = useBreathing(playing);
  const pad = cometGlowPad(headSize);
  const canvas = { width: width + pad * 2, height: height + pad * 2, style: [styles.canvas, { left: -pad, top: -pad }] };
  const { lap, progress } = laps;
  const headPosition = useAnimatedProps(() => {
    const head = pointOnPerimeter(perimeter, lap.value + progress.value);
    return { cx: head.x + pad, cy: head.y + pad };
  });
  const glowStyle = useAnimatedStyle(() => ({ opacity: playing ? breathing.value : headOpacity }));

  return (
    <View
      pointerEvents="none"
      accessible={Boolean(label)}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(laps.fraction * 100) }}
      style={[{ width, height }, style]}
    >
      <Svg {...canvas}>
        <G x={pad} y={pad}>
          <Path d={perimeter.path} stroke={trackColor} strokeOpacity={trackOpacity} strokeWidth={STROKE_WIDTH} fill="none" />
          {SEGMENT_INDICES.map((index) => (
            <ProgressCometSegment
              key={index}
              index={index}
              laps={laps}
              perimeter={perimeter}
              color={color}
              opacity={index === 0 ? LEAD_SEGMENT_OPACITY : SEGMENT_OPACITY}
              strokeWidth={STROKE_WIDTH}
            />
          ))}
        </G>
      </Svg>
      <Animated.View style={[StyleSheet.absoluteFill, glowStyle]}>
        <Svg {...canvas}>
          <AnimatedCircle animatedProps={headPosition} r={(headSize * GLOW_SCALE) / 2} fill={color} fillOpacity={GLOW_OPACITY} />
        </Svg>
      </Animated.View>
      <Svg {...canvas}>
        <AnimatedCircle animatedProps={headPosition} r={headSize / 2} fill={color} fillOpacity={playing ? 1 : headOpacity} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    position: 'absolute',
  },
});
