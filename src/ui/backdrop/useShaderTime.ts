import { useEffect } from 'react';
import { SharedValue, useFrameCallback, useSharedValue } from 'react-native-reanimated';

export function useShaderTime(running: boolean, fps: number): SharedValue<number> {
  const seconds = useSharedValue(0);
  const elapsed = useSharedValue(0);
  const sinceUpdate = useSharedValue(0);
  const frameInterval = 1 / fps;

  const frameCallback = useFrameCallback(({ timeSincePreviousFrame }) => {
    const delta = (timeSincePreviousFrame ?? 0) / 1000;
    elapsed.value += delta;
    sinceUpdate.value += delta;
    if (sinceUpdate.value < frameInterval) return;
    sinceUpdate.value = 0;
    seconds.value = elapsed.value;
  }, false);

  useEffect(() => {
    frameCallback.setActive(running);
  }, [frameCallback, running]);

  return seconds;
}
