import React from 'react';
import Animated, { useAnimatedProps } from 'react-native-reanimated';
import { Path } from 'react-native-svg';
import { cometSegmentDash } from '../cometSegments';
import { Perimeter } from '../roundedRectPerimeter';
import { ProgressLaps } from '../useProgressLaps';

export interface ProgressCometSegmentProps {
  index: number;
  laps: ProgressLaps;
  perimeter: Perimeter;
  color: string;
  opacity: number;
  strokeWidth: number;
}

const AnimatedPath = Animated.createAnimatedComponent(Path);

export function ProgressCometSegment({ index, laps, perimeter, color, opacity, strokeWidth }: ProgressCometSegmentProps) {
  const { lap, progress, endless } = laps;
  const total = perimeter.length;
  const animatedProps = useAnimatedProps(() => {
    const { visible, ...dash } = cometSegmentDash(index, lap.value, progress.value, endless.value, total);
    return { ...dash, strokeOpacity: visible ? opacity : 0 };
  });

  return (
    <AnimatedPath d={perimeter.path} stroke={color} strokeWidth={strokeWidth} fill="none" animatedProps={animatedProps} />
  );
}
