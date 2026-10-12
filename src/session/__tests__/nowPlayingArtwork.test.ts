import { RemoteTrack } from '../../data/types';
import { TrackIdentity, trackKey } from '../../ui/trackKey';
import {
  ARTWORK_HOLD_MS,
  FAILED_ARTWORK_RETRY_MS,
  NowPlayingArtwork,
  NowPlayingArtworkLookup,
  trackWithArtwork,
} from '../NowPlayingArtwork';

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flushPromises(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

const allowed = { allowed: true, commandGeneration: 4 };
const blocked = { allowed: false, commandGeneration: 4 };

const songA: TrackIdentity = { title: 'A', artist: 'Artist', album: 'One' };
const songB: TrackIdentity = { title: 'B', artist: 'Artist', album: 'Two' };
const songC: TrackIdentity = { title: 'C', artist: 'Artist', album: 'Three' };

function scriptedLookup() {
  const local = new Map<string, Deferred<string | null>>();
  const remote = new Map<string, Deferred<string | null>[]>();
  const generations: number[] = [];
  const lookup: NowPlayingArtworkLookup = {
    local(track) {
      const pending = deferred<string | null>();
      local.set(trackKey(track)!, pending);
      return pending.promise;
    },
    remote(track, commandGeneration) {
      generations.push(commandGeneration);
      const pending = deferred<string | null>();
      const key = trackKey(track)!;
      remote.set(key, [...(remote.get(key) ?? []), pending]);
      return pending.promise;
    },
  };
  return {
    lookup,
    local: (track: TrackIdentity) => local.get(trackKey(track)!)!,
    remoteCalls: (track: TrackIdentity) => remote.get(trackKey(track)!) ?? [],
    generations,
  };
}

function setup() {
  const scripted = scriptedLookup();
  const changes: Array<[string | null, string]> = [];
  let nowMs = 0;
  const controller = new NowPlayingArtwork(
    scripted.lookup,
    (artwork, key) => changes.push([artwork, key]),
    ARTWORK_HOLD_MS,
    () => nowMs
  );
  return {
    ...scripted,
    controller,
    changes,
    advanceClock(ms: number) {
      nowMs += ms;
      jest.advanceTimersByTime(ms);
    },
  };
}

async function showArtwork(env: ReturnType<typeof setup>, track: TrackIdentity, artwork: string) {
  env.controller.sync(track, allowed);
  env.local(track).resolve(artwork);
  await flushPromises();
}

describe('NowPlayingArtwork', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('shows a synced cover without a network request', async () => {
    const env = setup();
    expect(env.controller.sync(songA, allowed)).toBeNull();
    env.local(songA).resolve('file:///covers/one.cover');
    await flushPromises();

    expect(env.controller.artwork).toBe('file:///covers/one.cover');
    expect(env.changes).toEqual([['file:///covers/one.cover', trackKey(songA)]]);
    expect(env.remoteCalls(songA)).toHaveLength(0);
  });

  it('keeps the previous artwork while the next track resolves', async () => {
    const env = setup();
    await showArtwork(env, songA, 'file:///a.art');

    expect(env.controller.sync(songB, allowed)).toBe('file:///a.art');
    env.local(songB).resolve('file:///b.art');
    await flushPromises();

    expect(env.controller.artwork).toBe('file:///b.art');
    expect(env.changes.map(([artwork]) => artwork)).toEqual(['file:///a.art', 'file:///b.art']);
  });

  it('falls back to the placeholder once the hold expires', async () => {
    const env = setup();
    await showArtwork(env, songA, 'file:///a.art');

    env.controller.sync(songB, blocked);
    env.local(songB).resolve(null);
    await flushPromises();
    expect(env.controller.artwork).toBe('file:///a.art');

    env.advanceClock(ARTWORK_HOLD_MS);
    expect(env.controller.artwork).toBeNull();
    expect(env.changes.at(-1)).toEqual([null, trackKey(songB)]);
  });

  it('shows the placeholder as soon as the player confirms there is no artwork', async () => {
    const env = setup();
    await showArtwork(env, songA, 'file:///a.art');

    env.controller.sync(songB, allowed);
    env.local(songB).resolve(null);
    await flushPromises();
    env.remoteCalls(songB)[0].resolve(null);
    await flushPromises();

    expect(env.controller.artwork).toBeNull();
    env.controller.sync(songB, allowed);
    expect(env.remoteCalls(songB)).toHaveLength(1);
  });

  it('drops artwork that arrives after the track changed', async () => {
    const env = setup();
    env.controller.sync(songA, allowed);
    env.local(songA).resolve(null);
    await flushPromises();

    env.controller.sync(songB, allowed);
    env.remoteCalls(songA)[0].resolve('file:///stale.art');
    env.local(songB).resolve('file:///b.art');
    await flushPromises();

    expect(env.controller.artwork).toBe('file:///b.art');
    expect(env.changes).toEqual([['file:///b.art', trackKey(songB)]]);
  });

  it('waits for permission before requesting artwork from the player', async () => {
    const env = setup();
    env.controller.sync(songA, blocked);
    env.local(songA).resolve(null);
    await flushPromises();
    expect(env.remoteCalls(songA)).toHaveLength(0);

    env.controller.sync(songA, allowed);
    expect(env.remoteCalls(songA)).toHaveLength(1);
    expect(env.generations).toEqual([allowed.commandGeneration]);
    env.controller.sync(songA, allowed);
    expect(env.remoteCalls(songA)).toHaveLength(1);
  });

  it('retries a failed request after a delay', async () => {
    const env = setup();
    env.controller.sync(songA, allowed);
    env.local(songA).resolve(null);
    await flushPromises();
    env.remoteCalls(songA)[0].reject(new Error('preempted'));
    await flushPromises();

    env.controller.sync(songA, allowed);
    expect(env.remoteCalls(songA)).toHaveLength(1);

    env.advanceClock(FAILED_ARTWORK_RETRY_MS);
    env.controller.sync(songA, allowed);
    expect(env.remoteCalls(songA)).toHaveLength(2);
  });

  it('does not notify when consecutive tracks share a cover', async () => {
    const env = setup();
    await showArtwork(env, songA, 'file:///album.cover');
    env.controller.sync(songC, allowed);
    env.local(songC).resolve('file:///album.cover');
    await flushPromises();

    expect(env.changes).toHaveLength(1);
    env.advanceClock(ARTWORK_HOLD_MS);
    expect(env.controller.artwork).toBe('file:///album.cover');
  });

  it('forgets everything on reset', async () => {
    const env = setup();
    await showArtwork(env, songA, 'file:///a.art');
    env.controller.reset();
    expect(env.controller.artwork).toBeNull();
    expect(env.controller.sync(songA, allowed)).toBeNull();
  });
});

describe('trackWithArtwork', () => {
  const track: RemoteTrack = { id: 'now_playing', title: 'A', artist: 'Artist', album: 'One', duration: '3:00' };

  it('applies artwork only to the track it was resolved for', () => {
    expect(trackWithArtwork(track, trackKey(songB)!, 'file:///b.art')).toBeNull();
    expect(trackWithArtwork(track, trackKey(songA)!, 'file:///a.art')?.artwork).toBe('file:///a.art');
  });

  it('skips updates that change nothing', () => {
    expect(trackWithArtwork({ ...track, artwork: 'file:///a.art' }, trackKey(songA)!, 'file:///a.art')).toBeNull();
    expect(trackWithArtwork(track, trackKey(songA)!, null)).toBeNull();
    expect(trackWithArtwork(null, trackKey(songA)!, 'file:///a.art')).toBeNull();
  });
});
