import { useEffect, useRef } from 'react';
import { Easing, SharedValue, useSharedValue, withTiming } from 'react-native-reanimated';
import { useReducedMotion } from './useReducedMotion';

export interface ProgressLaps {
  lap: SharedValue<number>;
  progress: SharedValue<number>;
  endless: SharedValue<boolean>;
  fraction: number;
}

interface LapPosition {
  lap: number;
  progress: number;
}

interface Jump {
  from: LapPosition;
  to: LapPosition;
  startedAt: number;
}

const LOOP_END = 0.9;
const LOOP_START = 0.1;
const SETTLED_BELOW = 0.5;
const JUMP_THRESHOLD = 0.02;
const JUMP_DURATION_MS = 1000;
const JUMP_TIMING = { duration: JUMP_DURATION_MS, easing: Easing.linear };

function positionDuring({ from, to, startedAt }: Jump, now: number): LapPosition {
  const t = Math.min(1, Math.max(0, (now - startedAt) / JUMP_DURATION_MS));
  return { lap: from.lap + (to.lap - from.lap) * t, progress: from.progress + (to.progress - from.progress) * t };
}

export function useProgressLaps(trackKey: string, progress: number): ProgressLaps {
  const reducedMotion = useReducedMotion();
  const clamped = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  const target = useRef({ key: trackKey, lap: 0, progress: clamped, endless: false, settled: true });
  const jump = useRef<Jump>({ from: { lap: 0, progress: clamped }, to: { lap: 0, progress: clamped }, startedAt: 0 });
  const shownLap = useSharedValue(0);
  const shownProgress = useSharedValue(clamped);
  const shownEndless = useSharedValue(false);

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
    const now = Date.now();
    const from = positionDuring(jump.current, now);
    const to = { lap, progress: targetProgress };
    const distance = Math.abs(to.lap + to.progress - (from.lap + from.progress));
    shownEndless.value = endless;
    if (reducedMotion || distance < JUMP_THRESHOLD) {
      shownLap.value = to.lap;
      shownProgress.value = to.progress;
      jump.current = { from: to, to, startedAt: now };
      return;
    }
    shownLap.value = withTiming(to.lap, JUMP_TIMING);
    shownProgress.value = withTiming(to.progress, JUMP_TIMING);
    jump.current = { from, to, startedAt: now };
  }, [endless, lap, reducedMotion, shownEndless, shownLap, shownProgress, targetProgress]);

  return { lap: shownLap, progress: shownProgress, endless: shownEndless, fraction: targetProgress };
}
