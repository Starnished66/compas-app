export type SkipDirection = -1 | 0 | 1;

const DEFAULT_DIRECTION: SkipDirection = 1;

let lastSkip: { direction: SkipDirection; fromKey: string } | null = null;

export function recordSkip(direction: SkipDirection, fromKey: string | null): void {
  lastSkip = fromKey ? { direction, fromKey } : null;
}

export function skipDirectionFrom(fromKey: string): SkipDirection {
  return lastSkip?.fromKey === fromKey ? lastSkip.direction : DEFAULT_DIRECTION;
}
