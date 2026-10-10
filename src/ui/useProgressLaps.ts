import { useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';
import { useReducedMotion } from './useReducedMotion';

export interface ProgressLaps {
  lap: number;
  progress: number;
  endless: boolean;
}

const LOOP_END = 0.9;
const LOOP_START = 0.1;
const SETTLED_BELOW = 0.5;
const JUMP_THRESHOLD = 0.02;
const JUMP_DURATION_MS = 1000;

export function useProgressLaps(trackKey: string, progress: number): ProgressLaps {
  const reducedMotion = useReducedMotion();
  const clamped = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  const target = useRef({ key: trackKey, lap: 0, progress: clamped, endless: false, settled: true });
  const [shown, setShown] = useState<ProgressLaps>({ lap: 0, progress: clamped, endless: false });
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const jump = useRef(new Animated.Value(0)).current;

  const previous = target.current;
  if (previous.key !== trackKey) {
    target.current = { key: trackKey, lap: previous.lap + 1, progress: clamped, endless: false, settled: clamped < SETTLED_BELOW };
  } else if (previous.settled && previous.progress > LOOP_END && clamped < LOOP_START) {
    target.current = { ...previous, lap: previous.lap + 1, progress: clamped, endless: true };
  } else if (previous.progress !== clamped) {
    target.current = { ...previous, progress: clamped, settled: previous.settled || clamped < SETTLED_BELOW };
  }
  const { lap, endless } = target.current;
  const targetProgress = target.current.progress;

  useEffect(() => {
    const from = shownRef.current;
    const to = { lap, progress: targetProgress, endless };
    const distance = Math.abs(to.lap + to.progress - (from.lap + from.progress));
    if (reducedMotion || distance < JUMP_THRESHOLD) {
      setShown(to);
      return;
    }
    jump.setValue(0);
    const listener = jump.addListener(({ value }) => {
      setShown({
        lap: from.lap + (to.lap - from.lap) * value,
        progress: from.progress + (to.progress - from.progress) * value,
        endless: to.endless,
      });
    });
    const animation = Animated.timing(jump, {
      toValue: 1,
      duration: JUMP_DURATION_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    animation.start(({ finished }) => {
      if (finished) setShown(to);
    });
    return () => {
      animation.stop();
      jump.removeListener(listener);
    };
  }, [endless, jump, lap, reducedMotion, targetProgress]);

  return shown;
}
