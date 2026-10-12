export interface FlipRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FlipOffset {
  x: number;
  y: number;
  opacity: number;
}

export interface FlipMotion {
  from: FlipOffset;
  startedAt: number;
  delay: number;
  duration: number;
  dipOpacity?: number;
}

export type EasingFunction = (progress: number) => number;

export type SortRole = 'move' | 'enter' | 'rest';

export const REST_OFFSET: FlipOffset = { x: 0, y: 0, opacity: 1 };

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function blend(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

function dippedOpacity(from: number, dip: number, progress: number, easing: EasingFunction): number {
  if (progress < 0.5) return blend(from, dip, easing(progress * 2));
  return blend(dip, 1, easing(progress * 2 - 1));
}

export function offsetAt(motion: FlipMotion, now: number, easing: EasingFunction): FlipOffset {
  const progress = motion.duration > 0 ? clamp01((now - motion.startedAt - motion.delay) / motion.duration) : 1;
  const eased = easing(progress);
  const { from } = motion;
  return {
    x: blend(from.x, 0, eased),
    y: blend(from.y, 0, eased),
    opacity:
      motion.dipOpacity == null
        ? blend(from.opacity, 1, eased)
        : dippedOpacity(from.opacity, motion.dipOpacity, progress, easing),
  };
}

export function shiftRect(rect: FlipRect, offset: FlipOffset): FlipRect {
  return { ...rect, x: rect.x + offset.x, y: rect.y + offset.y };
}

export function intersectsViewport(rect: FlipRect, viewportHeight: number): boolean {
  return rect.y + rect.height > 0 && rect.y < viewportHeight;
}

export function sortRole(previous: FlipRect | undefined, next: FlipRect, viewportHeight: number): SortRole {
  if (!intersectsViewport(next, viewportHeight)) return 'rest';
  return previous && intersectsViewport(previous, viewportHeight) ? 'move' : 'enter';
}

export function verticalDirection(from: FlipRect | undefined, to: FlipRect | undefined): 1 | -1 {
  if (!from || !to) return 1;
  return to.y < from.y ? -1 : 1;
}

export type FlipMode = 'sort' | 'view';
export type FlipPart = 'box' | 'art';

export function snapshotsBeforeFlip(mode: FlipMode, part: FlipPart): boolean {
  return mode === 'sort' ? part === 'box' : part === 'art';
}

export function measuresAfterFlip(mode: FlipMode, part: FlipPart): boolean {
  return mode === 'view' || part === 'box';
}

export function sameRect(a: FlipRect, b: FlipRect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}
