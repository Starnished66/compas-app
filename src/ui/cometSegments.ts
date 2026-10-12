import { wrapFraction } from './roundedRectPerimeter';

export interface SegmentDash {
  visible: boolean;
  strokeDasharray: [number, number];
  strokeDashoffset: number;
}

export const COMET_SEGMENT_COUNT = 8;
const MIN_SEGMENT = 0.001;

export function cometSegmentDash(index: number, lap: number, progress: number, endless: boolean, perimeterLength: number): SegmentDash {
  'worklet';
  const share = index / COMET_SEGMENT_COUNT;
  const start = endless ? lap + progress - 1 + share : lap + progress * share;
  const length = endless ? 1 - share : progress - progress * share;
  return {
    visible: length > MIN_SEGMENT,
    strokeDasharray: [length * perimeterLength, Math.max(MIN_SEGMENT, (1 - length) * perimeterLength)],
    strokeDashoffset: -wrapFraction(start) * perimeterLength,
  };
}
