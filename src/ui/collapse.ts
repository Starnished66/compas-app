import { Animated } from 'react-native';

export type CollapseProgress = Animated.Value | Animated.AnimatedInterpolation<number>;

export function between(progress: CollapseProgress, expanded: number, collapsed: number) {
  return progress.interpolate({ inputRange: [0, 1], outputRange: [expanded, collapsed] });
}

export function fadeOnCollapse(progress: CollapseProgress) {
  return progress.interpolate({ inputRange: [0, 0.5], outputRange: [1, 0], extrapolate: 'clamp' });
}

export function fadeInOnCollapse(progress: CollapseProgress) {
  return progress.interpolate({ inputRange: [0.5, 1], outputRange: [0, 1], extrapolate: 'clamp' });
}
