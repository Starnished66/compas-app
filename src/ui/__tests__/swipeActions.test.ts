import { DEFAULT_SWIPE_ACTIONS, SWIPE_ACTIONS, isSwipeAction } from '../swipeActions';

describe('swipe actions', () => {
  it('defaults to queue on left-to-right and play next on right-to-left', () => {
    expect(DEFAULT_SWIPE_ACTIONS).toEqual({ right: 'queue', left: 'next' });
  });

  it('offers doing nothing', () => {
    expect(SWIPE_ACTIONS).toContain('none');
  });

  it('accepts only known stored values', () => {
    expect(isSwipeAction('next')).toBe(true);
    expect(isSwipeAction('remove')).toBe(false);
    expect(isSwipeAction(null)).toBe(false);
  });
});
