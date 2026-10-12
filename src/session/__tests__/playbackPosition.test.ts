import { PlaybackMode, RemoteTrack } from '../../data/types';
import { NO_PLAYBACK_POSITION, PlaybackPositionStore } from '../PlaybackPositionStore';
import { PolledPlayback, polledPlaybackChanged, withPolledPlayback } from '../polledPlayback';

describe('PlaybackPositionStore', () => {
  it('starts at zero', () => {
    expect(new PlaybackPositionStore().getSnapshot()).toBe(NO_PLAYBACK_POSITION);
  });

  it('notifies subscribers with a new snapshot when the position changes', () => {
    const store = new PlaybackPositionStore();
    const listener = jest.fn();
    store.subscribe(listener);
    store.set(1500, 180000);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toEqual({ positionMs: 1500, durationMs: 180000 });
  });

  it('keeps the snapshot and stays quiet when nothing changed', () => {
    const store = new PlaybackPositionStore();
    store.set(1500, 180000);
    const before = store.getSnapshot();
    const listener = jest.fn();
    store.subscribe(listener);
    store.set(1500, 180000);
    expect(listener).not.toHaveBeenCalled();
    expect(store.getSnapshot()).toBe(before);
  });

  it('updates only the position and keeps the duration', () => {
    const store = new PlaybackPositionStore();
    store.set(1500, 180000);
    store.setPosition(60000);
    expect(store.getSnapshot()).toEqual({ positionMs: 60000, durationMs: 180000 });
  });

  it('resets to zero', () => {
    const store = new PlaybackPositionStore();
    store.set(1500, 180000);
    store.reset();
    expect(store.getSnapshot()).toEqual(NO_PLAYBACK_POSITION);
  });

  it('stops notifying after unsubscribe', () => {
    const store = new PlaybackPositionStore();
    const listener = jest.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.set(1, 2);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('withPolledPlayback', () => {
  const track: RemoteTrack = { id: 'now_playing', title: 'Song', artist: 'Artist', album: 'Album', duration: '3:00' };
  const prev = {
    isPlaying: true,
    volume: 0.5,
    currentTrack: track,
    playbackMode: PlaybackMode.RepeatAll,
    currentFavorite: false,
    queue: [],
  };
  const same: PolledPlayback = {
    isPlaying: true,
    volume: 0.5,
    currentTrack: track,
    playbackMode: PlaybackMode.RepeatAll,
    currentFavorite: false,
  };

  it('returns the previous state when nothing changed', () => {
    expect(polledPlaybackChanged(prev, same)).toBe(false);
    expect(withPolledPlayback(prev, same)).toBe(prev);
  });

  it.each<[string, Partial<PolledPlayback>]>([
    ['isPlaying', { isPlaying: false }],
    ['volume', { volume: 0.6 }],
    ['currentTrack', { currentTrack: { ...track } }],
    ['playbackMode', { playbackMode: PlaybackMode.Shuffle }],
    ['currentFavorite', { currentFavorite: true }],
  ])('returns a merged state when %s changed', (_, change) => {
    const polled = { ...same, ...change };
    const next = withPolledPlayback(prev, polled);
    expect(next).not.toBe(prev);
    expect(next).toEqual({ ...prev, ...polled });
    expect(next.queue).toBe(prev.queue);
  });
});
