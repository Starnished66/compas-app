import { useEffect, useRef } from 'react';
import { DerivedValue, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';
import { BackdropUniforms, blendUniforms } from './backdropUniforms';

export function useUniformCrossfade(target: BackdropUniforms, durationMs: number, animate: boolean): DerivedValue<BackdropUniforms> {
  const from = useSharedValue(target);
  const to = useSharedValue(target);
  const progress = useSharedValue(1);
  const lastTarget = useRef(target);

  useEffect(() => {
    if (lastTarget.current === target) return;
    from.value = animate ? blendUniforms(from.value, lastTarget.current, progress.value) : target;
    lastTarget.current = target;
    to.value = target;
    progress.value = animate ? 0 : 1;
    if (animate) progress.value = withTiming(1, { duration: durationMs });
  }, [target, animate, durationMs, from, to, progress]);

  return useDerivedValue(() => blendUniforms(from.value, to.value, progress.value));
}
