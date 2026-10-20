import {
  shouldCommitNowPlayingGestureClose,
  shouldDismissNowPlaying,
  shouldRequestNowPlayingGestureClose,
} from '../nowPlayingGesture';

describe('shouldDismissNowPlaying', () => {
  it('dismisses after a deliberate downward drag', () => {
    expect(shouldDismissNowPlaying(110, 0)).toBe(true);
  });

  it('dismisses a short but quick downward flick', () => {
    expect(shouldDismissNowPlaying(24, 900)).toBe(true);
  });

  it('does not dismiss on an upward flick or a small slow drag', () => {
    expect(shouldDismissNowPlaying(-80, 1200)).toBe(false);
    expect(shouldDismissNowPlaying(24, 400)).toBe(false);
  });
});

describe('shouldCommitNowPlayingGestureClose', () => {
  const hiddenOffset = 800;

  it('commits only after the active close spring finishes at its target', () => {
    expect(shouldCommitNowPlayingGestureClose(true, true, 4, 4, hiddenOffset, hiddenOffset)).toBe(true);
    expect(shouldCommitNowPlayingGestureClose(false, true, 4, 4, hiddenOffset, hiddenOffset)).toBe(false);
  });

  it('ignores a completion after re-grab, external close, or reopen', () => {
    expect(shouldCommitNowPlayingGestureClose(true, false, 4, 5, hiddenOffset, hiddenOffset)).toBe(false);
    expect(shouldCommitNowPlayingGestureClose(true, true, 4, 5, hiddenOffset, hiddenOffset)).toBe(false);
    expect(shouldCommitNowPlayingGestureClose(true, true, 4, 4, 0, hiddenOffset)).toBe(false);
  });

  it('rechecks close ownership on JS before invoking the parent callback', () => {
    expect(shouldRequestNowPlayingGestureClose(true, true, 4, 4, hiddenOffset, hiddenOffset)).toBe(true);
    expect(shouldRequestNowPlayingGestureClose(false, true, 4, 4, hiddenOffset, hiddenOffset)).toBe(false);
    expect(shouldRequestNowPlayingGestureClose(true, false, 4, 4, hiddenOffset, hiddenOffset)).toBe(false);
    expect(shouldRequestNowPlayingGestureClose(true, true, 4, 5, hiddenOffset, hiddenOffset)).toBe(false);
    expect(shouldRequestNowPlayingGestureClose(true, true, 4, 4, 0, hiddenOffset)).toBe(false);
  });
});
