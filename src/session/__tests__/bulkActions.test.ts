import { RemoteApi } from '../../data/RemoteApi';
import { EntryTarget } from '../LibraryEntryFactory';
import { queueInsertionOffsets, queueInsertWindowMatches, queueRemovalAmbiguousAt, queueRemovalMatches, readQueueSnapshot, resolveBulkSongs, runPlaylistCreationJob, runSerialBulkWrites, waitForQueueTransition } from '../bulkActions';

function song(index: number, title = 'Same title') {
  return { index, title, artist: 'Artist', album: 'Album' };
}

describe('resolveBulkSongs', () => {
  it('expands album pages and deduplicates by stable song ID', async () => {
    const library = jest.fn()
      .mockResolvedValueOnce({ total: 3, songs: [song(1), song(2)] })
      .mockResolvedValueOnce({ total: 3, songs: [song(2), song(3)] });
    const api = { library } as unknown as RemoteApi;
    const target: EntryTarget = { type: 'Album', group: { name: 'Album', albumArtist: 'Artist', count: 3, index: 0 }, context: null };

    const result = await resolveBulkSongs(api, [target]);

    expect(library).toHaveBeenCalledTimes(2);
    expect(library).toHaveBeenNthCalledWith(1, 0, 100, null, { album: 'Album', albumArtist: 'Artist' });
    expect(result.map(({ song: item }) => item.index)).toEqual([1, 2, 3]);
  });

  it('preserves playlist page order while deduplicating songs across selected sources', async () => {
    const playlistPage = jest.fn()
      .mockResolvedValueOnce({ total: 3, nextOffset: 2, revision: 'a', songs: [song(4), song(4)] })
      .mockResolvedValueOnce({ total: 3, nextOffset: 3, revision: 'a', songs: [song(5)] });
    const api = { playlistPage, library: jest.fn() } as unknown as RemoteApi;
    const target: EntryTarget = { type: 'Playlist', playlist: { name: 'Mix', key: 'Mix', internal: false, writable: true } };
    const selectedSong: EntryTarget = { type: 'Song', song: song(5), context: {}, catalogRevision: 'a' };

    const result = await resolveBulkSongs(api, [target, selectedSong]);

    expect(playlistPage).toHaveBeenCalledTimes(2);
    expect(result.map(({ song: item }) => item.index)).toEqual([4, 5]);
  });

  it('stops between requests when cancelled', async () => {
    const library = jest.fn().mockResolvedValue({ total: 201, songs: Array.from({ length: 100 }, (_, index) => song(index + 1)) });
    const api = { library } as unknown as RemoteApi;
    const target: EntryTarget = { type: 'Group', kind: 'artist', group: { name: 'Artist', albumArtist: '', count: 201, index: 0 } };
    let checks = 0;

    const result = await resolveBulkSongs(api, [target], () => ++checks > 2);

    expect(library).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(100);
  });

  it('resolves a selected genre through the existing library filter', async () => {
    const library = jest.fn().mockResolvedValue({ total: 1, songs: [song(7)] });
    const api = { library } as unknown as RemoteApi;
    const target: EntryTarget = { type: 'Group', kind: 'genre', group: { name: 'Jazz', albumArtist: '', count: 1, index: 0 } };
    await expect(resolveBulkSongs(api, [target])).resolves.toEqual([{ song: song(7), catalogRevision: undefined }]);
    expect(library).toHaveBeenCalledWith(0, 100, null, { genre: 'Jazz' });
  });

  it('stops on an authorization failure and never sends later writes', async () => {
    const write = jest.fn().mockRejectedValue(Object.assign(new Error('Unauthorized'), { statusCode: 401 }));
    const result = await runSerialBulkWrites([1, 2, 3], () => false, write);
    expect(write).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ processed: 1, succeeded: 0, failed: 1, stopped: true });
  });

  it('finishes a cancelled in-flight job and permits the next job', async () => {
    let cancelled = false;
    const firstWrite = jest.fn(async () => { cancelled = true; });
    const first = await runSerialBulkWrites([1, 2], () => cancelled, firstWrite);
    const secondWrite = jest.fn();
    const second = await runSerialBulkWrites([3], () => false, secondWrite);
    expect(first).toMatchObject({ processed: 1, succeeded: 1, stopped: true });
    expect(firstWrite).toHaveBeenCalledTimes(1);
    expect(second.succeeded).toBe(1);
    expect(secondWrite).toHaveBeenCalledTimes(1);
  });

  it('stops after an awaited write when the active player changes', async () => {
    let activePlayer = 'player-a';
    const write = jest.fn(async () => { activePlayer = 'player-b'; });
    const result = await runSerialBulkWrites([1, 2], () => activePlayer !== 'player-a', write);
    expect(result).toMatchObject({ processed: 1, succeeded: 1, stopped: true });
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('does not count a cancelled preflight as a processed write', async () => {
    let cancelled = false;
    const write = jest.fn(async () => {
      cancelled = true;
      throw new Error('Cancelled before request');
    });
    const result = await runSerialBulkWrites([1, 2], () => cancelled, write);
    expect(result).toMatchObject({ processed: 0, succeeded: 0, failed: 0, stopped: true });
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('does not append to a playlist when creation fails', async () => {
    const create = jest.fn().mockRejectedValue(new Error('Name is already in use'));
    const append = jest.fn();
    const result = await runPlaylistCreationJob(create, [song(1), song(2)], () => false, append);
    expect(result.created).toBe(false);
    expect(result.counts).toMatchObject({ failed: 0, processed: 0, succeeded: 0 });
    expect(append).not.toHaveBeenCalled();
  });

  it('waits through an async queue ACK and discovers the actual insertion position', async () => {
    const before = { revision: 8, total: 3, songs: [song(10), song(11), song(12)] };
    const after = { revision: 9, total: 4, songs: [song(10), song(20), song(11), song(12)] };
    const read = jest.fn().mockResolvedValueOnce(before).mockResolvedValueOnce(after);
    const wait = jest.fn().mockResolvedValue(undefined);
    const result = await waitForQueueTransition(before, 9, (observed) => observed.total === before.total + 1 && queueInsertionOffsets(before.songs, observed.songs, 20).length > 0, read, () => false, wait);
    expect(result).toEqual(after);
    expect(queueInsertionOffsets(before.songs, after.songs, 20)).toEqual([1]);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('does not publish a queue transition read that finishes after cancellation', async () => {
    const before = { revision: 1, total: 1, songs: [song(1)] };
    let cancelled = false;
    const result = await waitForQueueTransition(before, 2, () => true, async () => {
      cancelled = true;
      return { revision: 2, total: 2, songs: [song(1), song(2)] };
    }, () => cancelled, async () => undefined);
    expect(result).toBeNull();
  });

  it('verifies later queue inserts at the known cursor and retains duplicate ambiguity', () => {
    const before = [song(1), song(2), song(3)];
    expect(queueInsertWindowMatches(before, 1, 9, [song(1), song(9), song(2)], 0)).toBe(true);
    expect(queueInsertWindowMatches(before, 1, 9, [song(1), song(9), song(8)], 0)).toBe(false);
    expect(queueInsertionOffsets([song(1), song(9), song(9)], [song(1), song(9), song(9), song(9)], 9)).toEqual([1, 2, 3]);
  });

  it('rejects external queue changes and ambiguous duplicate occurrences', async () => {
    const before = { revision: 4, total: 3, songs: [song(1), song(2), song(3)] };
    const external = { revision: 5, total: 2, songs: [song(2), song(3)] };
    await expect(waitForQueueTransition(before, 5, (observed) => queueRemovalMatches(before.songs, observed.songs, 1), async () => external, () => false, async () => undefined)).rejects.toThrow('Queue changed unexpectedly');
    expect(queueRemovalAmbiguousAt([song(1), song(1)], 0)).toBe(true);
    expect(queueRemovalAmbiguousAt([song(0)], 0)).toBe(true);
    expect(queueRemovalMatches([song(1), song(1)], [song(1)], 0)).toBe(false);
    expect(queueRemovalMatches(before.songs, [song(1), song(3)], 1)).toBe(true);
  });

  it('rejects an external edit detected between queue pages', async () => {
    const queue = jest.fn().mockResolvedValueOnce({ total: 26, offset: 0, revision: 2, songs: Array.from({ length: 25 }, (_, i) => song(i + 1)) })
      .mockResolvedValueOnce({ total: 26, offset: 25, revision: 3, songs: [song(26)] });
    await expect(readQueueSnapshot(queue)).rejects.toThrow('Queue changed while reading');
  });
});
