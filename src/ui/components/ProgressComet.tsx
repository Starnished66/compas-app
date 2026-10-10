import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { Easings, motionDuration } from '../motion';
import { roundedRectPerimeter } from '../roundedRectPerimeter';
import { ProgressLaps } from '../useProgressLaps';
import { useReducedMotion } from '../useReducedMotion';

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
const SEGMENT_COUNT = 8;
const LEAD_SEGMENT_OPACITY = 0.15;
const SEGMENT_OPACITY = 0.12;
const GLOW_SCALE = 2.4;
const GLOW_OPACITY = 0.28;
const BREATHE_MS = 1200;
const BREATHE_MIN = 0.3;
const MIN_SEGMENT = 0.001;

interface Segment {
  start: number;
  length: number;
}

export function cometGlowPad(headSize: number): number {
  return Math.ceil((headSize * GLOW_SCALE) / 2);
}

function wrap(value: number): number {
  return ((value % 1) + 1) % 1;
}

function cometSegments({ lap, progress, endless }: ProgressLaps): Segment[] {
  return Array.from({ length: SEGMENT_COUNT }, (_, k) => {
    const share = k / SEGMENT_COUNT;
    if (endless) return { start: lap + progress - 1 + share, length: 1 - share };
    const offset = progress * share;
    return { start: lap + offset, length: progress - offset };
  });
}

function useBreathing(active: boolean) {
  const reducedMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!active || reducedMotion) {
      opacity.setValue(1);
      return;
    }
    const step = (toValue: number) =>
      Animated.timing(opacity, {
        toValue,
        duration: motionDuration(reducedMotion, BREATHE_MS),
        easing: Easings.easeInOut,
        useNativeDriver: true,
      });
    const loop = Animated.loop(Animated.sequence([step(BREATHE_MIN), step(1)]));
    loop.start();
    return () => loop.stop();
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
  const total = perimeter.length;
  const head = perimeter.pointAt(laps.lap + laps.progress);
  const pad = cometGlowPad(headSize);
  const canvas = { width: width + pad * 2, height: height + pad * 2, style: [styles.canvas, { left: -pad, top: -pad }] };

  return (
    <View
      pointerEvents="none"
      accessible={Boolean(label)}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(laps.progress * 100) }}
      style={[{ width, height }, style]}
    >
      <Svg {...canvas}>
        <G x={pad} y={pad}>
          <Path d={perimeter.path} stroke={trackColor} strokeOpacity={trackOpacity} strokeWidth={STROKE_WIDTH} fill="none" />
          {cometSegments(laps).map((segment, index) =>
            segment.length > MIN_SEGMENT ? (
              <Path
                key={index}
                d={perimeter.path}
                stroke={color}
                strokeOpacity={index === 0 ? LEAD_SEGMENT_OPACITY : SEGMENT_OPACITY}
                strokeWidth={STROKE_WIDTH}
                strokeDasharray={[segment.length * total, Math.max(MIN_SEGMENT, (1 - segment.length) * total)]}
                strokeDashoffset={-wrap(segment.start) * total}
                fill="none"
              />
            ) : null,
          )}
        </G>
      </Svg>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: playing ? breathing : headOpacity }]}>
        <Svg {...canvas}>
          <Circle cx={head.x + pad} cy={head.y + pad} r={(headSize * GLOW_SCALE) / 2} fill={color} fillOpacity={GLOW_OPACITY} />
        </Svg>
      </Animated.View>
      <Svg {...canvas}>
        <Circle cx={head.x + pad} cy={head.y + pad} r={headSize / 2} fill={color} fillOpacity={playing ? 1 : headOpacity} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    position: 'absolute',
  },
});
