import { useCallback, useEffect } from 'react';
import { FrameInfo, SharedValue, useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { useTabActive } from './tabActivity';

// Each phase change redraws the canvas that reads it, and so the whole window; at the display
// rate (90 Hz on tablets) a decorative loop kept the app drawing nonstop, even when idle.
const DEFAULT_FPS = 30;

export function useLoopPhase(periodMs: number, running: boolean, fps: number = DEFAULT_FPS): SharedValue<number> {
  const phase = useSharedValue(0);
  const period = useSharedValue(periodMs);
  const pending = useSharedValue(0);
  const frameMs = 1000 / fps;

  useEffect(() => {
    period.value = periodMs;
  }, [period, periodMs]);

  const advance = useCallback(
    ({ timeSincePreviousFrame }: FrameInfo) => {
      'worklet';
      pending.value += timeSincePreviousFrame ?? 0;
      if (pending.value < frameMs) return;
      phase.value = (phase.value + pending.value / period.value) % 1;
      pending.value = 0;
    },
    [phase, period, pending, frameMs],
  );
  const frameCallback = useFrameCallback(advance, false);
  const visible = useTabActive();

  useEffect(() => {
    frameCallback.setActive(running && visible);
  }, [frameCallback, running, visible]);

  return phase;
}
