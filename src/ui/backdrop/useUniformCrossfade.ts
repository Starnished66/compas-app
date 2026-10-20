import { useEffect, useRef } from 'react';
import { DerivedValue, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';
import { BackdropUniforms, blendUniforms } from './backdropUniforms';

export function useUniformCrossfade(target: BackdropUniforms, durationMs: number, animate: boolean): DerivedValue<BackdropUniforms> {
  const from = useSharedValue(target);
  const to = useSharedValue(target);
  const progress = useSharedValue(1);
  const lastTarget = useRef(target);

  useEffect(() => {
    if (!animate) {
      from.value = target;
      to.value = target;
      progress.value = 1;
      lastTarget.current = target;
      return;
    }
    if (lastTarget.current === target) return;
    from.value = blendUniforms(from.value, lastTarget.current, progress.value);
    lastTarget.current = target;
    to.value = target;
    progress.value = 0;
    progress.value = withTiming(1, { duration: durationMs });
  }, [target, animate, durationMs, from, to, progress]);

  return useDerivedValue(() => blendUniforms(from.value, to.value, progress.value));
}
