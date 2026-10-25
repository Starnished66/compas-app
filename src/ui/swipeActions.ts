export type SwipeAction = 'queue' | 'next' | 'none';
export type SwipeDirection = 'right' | 'left';

export const SWIPE_ACTIONS: ReadonlyArray<SwipeAction> = ['queue', 'next', 'none'];

export const SWIPE_ACTION_LABELS: Record<SwipeAction, string> = {
  queue: 'Add to queue',
  next: 'Play next',
  none: 'Do nothing',
};

/** Left to right adds to the queue; right to left plays next. */
export const DEFAULT_SWIPE_ACTIONS: Record<SwipeDirection, SwipeAction> = { right: 'queue', left: 'next' };

export function isSwipeAction(value: unknown): value is SwipeAction {
  return typeof value === 'string' && (SWIPE_ACTIONS as ReadonlyArray<string>).includes(value);
}
