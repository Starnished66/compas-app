import { Easing } from 'react-native-reanimated';
import { EasingCurves } from './motion';

export const WorkletEasings = {
  standard: Easing.bezier(...EasingCurves.standard),
  exit: Easing.bezier(...EasingCurves.exit),
  overshoot: Easing.bezier(...EasingCurves.overshoot),
  overshootSoft: Easing.bezier(...EasingCurves.overshootSoft),
  ease: Easing.bezier(...EasingCurves.ease),
  easeInOut: Easing.bezier(...EasingCurves.easeInOut),
  easeOut: Easing.bezier(...EasingCurves.easeOut),
  linear: Easing.linear,
} as const;
