import { PlaybackMode } from '../data/types';

export function fromNumeric(value: number, supportsShuffleModes: boolean): PlaybackMode {
  switch (value) {
    case 1:
      return PlaybackMode.RepeatAll;
    case 2:
      return PlaybackMode.RepeatOne;
    case 3:
      return supportsShuffleModes ? PlaybackMode.ShuffleRepeat : PlaybackMode.Shuffle;
    case 4:
      return supportsShuffleModes ? PlaybackMode.Shuffle : PlaybackMode.Sequential;
    case 0:
    default:
      return PlaybackMode.Sequential;
  }
}

export function toNumeric(mode: PlaybackMode, supportsShuffleModes: boolean): number {
  switch (mode) {
    case PlaybackMode.RepeatAll:
      return 1;
    case PlaybackMode.RepeatOne:
      return 2;
    case PlaybackMode.ShuffleRepeat:
      return 3;
    case PlaybackMode.Shuffle:
      return supportsShuffleModes ? 4 : 3;
    case PlaybackMode.Sequential:
    default:
      return 0;
  }
}

export function isShuffleMode(mode: PlaybackMode): boolean {
  return mode === PlaybackMode.Shuffle || mode === PlaybackMode.ShuffleRepeat;
}

export function toggleShuffleMode(
  mode: PlaybackMode,
  supportsShuffleModes: boolean,
  restoreMode: PlaybackMode = PlaybackMode.Sequential,
): PlaybackMode {
  if (supportsShuffleModes) {
    if (mode === PlaybackMode.ShuffleRepeat) return PlaybackMode.RepeatAll;
    if (mode === PlaybackMode.Shuffle) return PlaybackMode.Sequential;
  } else if (mode === PlaybackMode.Shuffle) {
    return isShuffleMode(restoreMode) ? PlaybackMode.Sequential : restoreMode;
  }
  if (supportsShuffleModes && mode === PlaybackMode.RepeatAll) return PlaybackMode.ShuffleRepeat;
  return PlaybackMode.Shuffle;
}

export function toggleRepeatMode(mode: PlaybackMode, supportsShuffleModes: boolean): PlaybackMode {
  if (supportsShuffleModes && isShuffleMode(mode)) {
    return mode === PlaybackMode.ShuffleRepeat ? PlaybackMode.Shuffle : PlaybackMode.ShuffleRepeat;
  }
  if (isShuffleMode(mode) || mode === PlaybackMode.Sequential) return PlaybackMode.RepeatAll;
  if (mode === PlaybackMode.RepeatAll) return PlaybackMode.RepeatOne;
  return PlaybackMode.Sequential;
}
