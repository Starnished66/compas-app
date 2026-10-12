import { useEffect, useRef, useState } from 'react';
import { useTabActive } from './tabActivity';

const TICK_MS = 250;
const RESYNC_TOLERANCE_MS = 1500;

interface Anchor {
  positionMs: number;
  atMs: number;
}

function projected(anchor: Anchor, playing: boolean, durationMs: number, nowMs: number): number {
  const advanced = playing ? anchor.positionMs + (nowMs - anchor.atMs) : anchor.positionMs;
  return durationMs > 0 ? Math.min(durationMs, advanced) : advanced;
}

export function useInterpolatedPosition(positionMs: number, durationMs: number, playing: boolean): number {
  const anchorRef = useRef<Anchor>({ positionMs, atMs: Date.now() });
  const reportedRef = useRef(positionMs);
  const playingRef = useRef(playing);
  const [, setTick] = useState(0);
  const visible = useTabActive();

  if (reportedRef.current !== positionMs || playingRef.current !== playing) {
    const now = Date.now();
    const current = projected(anchorRef.current, playingRef.current, durationMs, now);
    const drift = positionMs - current;
    const playerLagsBehindEstimate = playing && playingRef.current && drift <= 0 && -drift < RESYNC_TOLERANCE_MS;
    anchorRef.current = playerLagsBehindEstimate ? { positionMs: current, atMs: now } : { positionMs, atMs: now };
    reportedRef.current = positionMs;
    playingRef.current = playing;
  }

  useEffect(() => {
    if (!playing || !visible || durationMs <= 0) return;
    const timer = setInterval(() => setTick((tick) => tick + 1), TICK_MS);
    return () => clearInterval(timer);
  }, [playing, visible, durationMs]);

  return projected(anchorRef.current, playing, durationMs, Date.now());
}
