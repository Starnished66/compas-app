import { Durations } from '../motion';
import type { BoxSnapshot } from './flipLayout';
import { verticalDirection, type FlipRect } from './flipMotion';

const SORT_ENTER_SHIFT = 16;
const SORT_FADE_DISTANCE = 24;

export function planSortMotion(rect: FlipRect, previous: BoxSnapshot | undefined, entering: boolean, delay: number) {
  if (entering || !previous) {
    const direction = verticalDirection(rect, previous?.rect);
    return { from: { x: 0, y: direction * SORT_ENTER_SHIFT, opacity: 0 }, timing: {
      delay: Durations.sortEnterDelay + delay,
      duration: Durations.sortEnter,
      dip: false,
    } };
  }
  const dx = previous.rect.x - rect.x;
  const dy = previous.rect.y - rect.y;
  if (!dx && !dy && previous.opacity === 1) return null;
  return { from: { x: dx, y: dy, opacity: previous.opacity }, timing: {
    delay,
    duration: Durations.sortFlip,
    dip: Math.hypot(dx, dy) > SORT_FADE_DISTANCE,
  } };
}
