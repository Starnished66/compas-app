import { useCallback, useEffect } from 'react';
import { FrameInfo, SharedValue, useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { useTabActive } from './tabActivity';

export function useLoopPhase(periodMs: number, running: boolean): SharedValue<number> {
  const phase = useSharedValue(0);
  const period = useSharedValue(periodMs);

  useEffect(() => {
    period.value = periodMs;
  }, [period, periodMs]);

  const advance = useCallback(
    ({ timeSincePreviousFrame }: FrameInfo) => {
      'worklet';
      phase.value = (phase.value + (timeSincePreviousFrame ?? 0) / period.value) % 1;
    },
    [phase, period],
  );
  const frameCallback = useFrameCallback(advance, false);
  const visible = useTabActive();

  useEffect(() => {
    frameCallback.setActive(running && visible);
  }, [frameCallback, running, visible]);

  return phase;
}
