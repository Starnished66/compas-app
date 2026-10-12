import { LibraryArtworkStore } from '../LibraryArtworkStore';

const entry = (id: string, artwork?: string) => ({ id, title: id, subtitle: '', artwork });

describe('LibraryArtworkStore', () => {
  afterEach(() => jest.useRealTimers());

  it('batches queued artwork and notifies only the affected entries', () => {
    jest.useFakeTimers();
    const store = new LibraryArtworkStore(50);
    const first = jest.fn();
    const second = jest.fn();
    const any = jest.fn();
    store.subscribeToEntry('a', first);
    store.subscribeToEntry('b', second);
    store.subscribe(any);

    store.queue('a', 'file://a');
    store.queue('a', 'file://a2');
    expect(store.get('a')).toBeUndefined();

    jest.advanceTimersByTime(50);
    expect(store.get('a')).toBe('file://a2');
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    expect(any).toHaveBeenCalledTimes(1);
  });

  it('skips notifications when the artwork did not change', () => {
    const store = new LibraryArtworkStore();
    const listener = jest.fn();
    store.subscribeToEntry('a', listener);
    store.queue('a', 'file://a');
    store.flush();
    store.queue('a', 'file://a');
    store.flush();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('stops notifying after unsubscribing', () => {
    const store = new LibraryArtworkStore();
    const listener = jest.fn();
    const unsubscribe = store.subscribeToEntry('a', listener);
    unsubscribe();
    store.queue('a', 'file://a');
    store.flush();
    expect(listener).not.toHaveBeenCalled();
  });

  it('prefers stored artwork over the artwork an entry was created with', () => {
    const store = new LibraryArtworkStore();
    store.queue('a', 'file://fresh');
    store.flush();
    expect(store.artworkOf(entry('a', 'file://initial'))).toBe('file://fresh');
    expect(store.artworkOf(entry('b', 'file://initial'))).toBe('file://initial');
  });

  it('finds the first artwork, checking the preferred entry first', () => {
    const store = new LibraryArtworkStore();
    const entries = [entry('a'), entry('b'), entry('c', 'file://c')];
    expect(store.firstArtwork(entries)).toBe('file://c');
    store.queue('b', 'file://b');
    store.flush();
    expect(store.firstArtwork(entries)).toBe('file://b');
    expect(store.firstArtwork(entries, entry('album', 'file://album'))).toBe('file://album');
    expect(store.firstArtwork([])).toBeUndefined();
  });

  it('clears stored and pending artwork and notifies subscribers', () => {
    jest.useFakeTimers();
    const store = new LibraryArtworkStore(50);
    store.queue('a', 'file://a');
    store.flush();
    const listener = jest.fn();
    store.subscribeToEntry('a', listener);
    store.queue('b', 'file://b');
    store.clear();
    jest.advanceTimersByTime(50);
    expect(store.get('a')).toBeUndefined();
    expect(store.get('b')).toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('LibraryArtworkStore requests', () => {
  it('lets each entry request artwork once until the store is cleared', () => {
    const store = new LibraryArtworkStore(50);
    expect(store.claimRequest('a')).toBe(true);
    expect(store.claimRequest('a')).toBe(false);
    store.queue('b', 'file://b');
    store.flush();
    expect(store.claimRequest('b')).toBe(false);
    store.clear();
    expect(store.claimRequest('a')).toBe(true);
  });
});
