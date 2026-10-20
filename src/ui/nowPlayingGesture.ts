const DISMISS_DISTANCE = 110;
const DISMISS_VELOCITY = 850;
const MIN_VELOCITY_DISTANCE = 20;

export function shouldDismissNowPlaying(translationY: number, velocityY: number): boolean {
  'worklet';
  if (translationY >= DISMISS_DISTANCE) return true;
  return translationY >= MIN_VELOCITY_DISTANCE && velocityY >= DISMISS_VELOCITY;
}

export function shouldCommitNowPlayingGestureClose(
  finished: boolean | undefined,
  closePending: boolean,
  closeToken: number,
  currentToken: number,
  targetOffset: number,
  closeOffset: number,
): boolean {
  'worklet';
  return finished === true && closePending && closeToken === currentToken && targetOffset === closeOffset;
}

export function shouldRequestNowPlayingGestureClose(
  visible: boolean,
  closePending: boolean,
  closeToken: number,
  currentToken: number,
  targetOffset: number,
  closeOffset: number,
): boolean {
  return visible && closePending && closeToken === currentToken && targetOffset === closeOffset;
}
