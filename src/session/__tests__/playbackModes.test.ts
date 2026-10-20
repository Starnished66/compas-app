import { PlaybackMode } from '../../data/types';
import { fromNumeric, isShuffleMode, toNumeric, toggleRepeatMode, toggleShuffleMode } from '../playbackModes';

describe('playback mode mapping', () => {
  it('maps the new shuffle modes only when the player advertises support', () => {
    expect(fromNumeric(3, false)).toBe(PlaybackMode.Shuffle);
    expect(fromNumeric(4, false)).toBe(PlaybackMode.Sequential);
    expect(fromNumeric(3, true)).toBe(PlaybackMode.ShuffleRepeat);
    expect(fromNumeric(4, true)).toBe(PlaybackMode.Shuffle);
    expect(toNumeric(PlaybackMode.Shuffle, false)).toBe(3);
    expect(toNumeric(PlaybackMode.ShuffleRepeat, false)).toBe(3);
    expect(toNumeric(PlaybackMode.Shuffle, true)).toBe(4);
    expect(toNumeric(PlaybackMode.ShuffleRepeat, true)).toBe(3);
  });

  it('toggles shuffle off to the remembered unshuffled mode', () => {
    expect(toggleShuffleMode(PlaybackMode.RepeatOne, true)).toBe(PlaybackMode.Shuffle);
    expect(toggleShuffleMode(PlaybackMode.RepeatAll, true)).toBe(PlaybackMode.ShuffleRepeat);
    expect(toggleShuffleMode(PlaybackMode.ShuffleRepeat, true, PlaybackMode.RepeatAll)).toBe(PlaybackMode.RepeatAll);
    expect(toggleShuffleMode(PlaybackMode.Shuffle, false, PlaybackMode.RepeatOne)).toBe(PlaybackMode.RepeatOne);
    expect(toNumeric(toggleShuffleMode(PlaybackMode.RepeatAll, false), false)).toBe(3);
  });

  it('uses independent off modes when toggling shuffle-aware modes', () => {
    const shuffledFinite = toggleShuffleMode(PlaybackMode.Sequential, true);
    const repeatOn = toggleRepeatMode(shuffledFinite, true);
    expect([shuffledFinite, repeatOn, toggleShuffleMode(repeatOn, true)]).toEqual([
      PlaybackMode.Shuffle,
      PlaybackMode.ShuffleRepeat,
      PlaybackMode.RepeatAll,
    ]);

    const shuffledRepeating = toggleShuffleMode(PlaybackMode.RepeatAll, true);
    const repeatOff = toggleRepeatMode(shuffledRepeating, true);
    expect([shuffledRepeating, repeatOff, toggleShuffleMode(repeatOff, true)]).toEqual([
      PlaybackMode.ShuffleRepeat,
      PlaybackMode.Shuffle,
      PlaybackMode.Sequential,
    ]);
  });

  it('cycles repeat normally outside shuffle and toggles repeat in shuffle modes', () => {
    expect(toggleRepeatMode(PlaybackMode.Sequential, true)).toBe(PlaybackMode.RepeatAll);
    expect(toggleRepeatMode(PlaybackMode.RepeatAll, true)).toBe(PlaybackMode.RepeatOne);
    expect(toggleRepeatMode(PlaybackMode.RepeatOne, true)).toBe(PlaybackMode.Sequential);
    expect(toggleRepeatMode(PlaybackMode.ShuffleRepeat, true)).toBe(PlaybackMode.Shuffle);
    expect(toggleRepeatMode(PlaybackMode.Shuffle, true)).toBe(PlaybackMode.ShuffleRepeat);
    expect(toggleRepeatMode(PlaybackMode.Shuffle, false)).toBe(PlaybackMode.RepeatAll);
    expect(isShuffleMode(PlaybackMode.ShuffleRepeat)).toBe(true);
    expect(isShuffleMode(PlaybackMode.Shuffle)).toBe(true);
    expect(isShuffleMode(PlaybackMode.RepeatAll)).toBe(false);
  });
});
