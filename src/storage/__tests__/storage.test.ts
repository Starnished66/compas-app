// expo-crypto ships ESM and needs the native runtime; src/data/cryptoUtils falls back to pure-JS SHA-256 when it throws.
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async () => {
    throw new Error('expo-crypto is unavailable under Jest');
  },
}));

import { SecurePinStore } from '../securePinStore';
import { SyncedCoverStore } from '../syncedCoverStore';
import {
  SyncedCatalogStore,
  COVER_PENDING,
  COVER_STORED,
  COVER_MISSING,
} from '../syncedCatalogStore';
import { CatalogSyncWorker } from '../catalogSyncWorker';
import { RemoteApi } from '../../core/api';
import { HttpResponse, HttpTransport } from '../../core/transport';

describe('SecurePinStore', () => {
  let pinStore: SecurePinStore;

  beforeEach(() => {
    pinStore = new SecurePinStore();
  });

  test('stores, retrieves and removes PIN', async () => {
    await pinStore.put('player-1', '123456');
    expect(await pinStore.get('player-1')).toBe('123456');

    await pinStore.remove('player-1');
    expect(await pinStore.get('player-1')).toBeNull();
  });

  test('validates 4 to 12 digits', async () => {
    await expect(pinStore.put('p1', '123')).rejects.toThrow('PIN must contain 4 to 12 digits');
    await expect(pinStore.put('p1', '1234567890123')).rejects.toThrow('PIN must contain 4 to 12 digits');
    await expect(pinStore.put('p1', 'abcd')).rejects.toThrow('PIN must contain 4 to 12 digits');
  });
});

describe('SyncedCoverStore', () => {
  let coverStore: SyncedCoverStore;

  beforeEach(() => {
    coverStore = new SyncedCoverStore('/tmp/test-covers/');
  });

  test('computes deterministic sha256 digests', () => {
    const d1 = coverStore.digest('test-key');
    const d2 = coverStore.digest('test-key');
    expect(d1).toBe(d2);
    expect(d1.length).toBe(64);
  });

  test('puts, retrieves, and checks containment of cover bytes', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    expect(await coverStore.contains('lib-1', 'cov-1')).toBe(false);

    await coverStore.put('lib-1', 'cov-1', bytes);
    expect(await coverStore.contains('lib-1', 'cov-1')).toBe(true);

    const retrieved = await coverStore.getBytes('lib-1', 'cov-1');
    expect(retrieved).toEqual(bytes);

    await coverStore.delete('lib-1', 'cov-1');
    expect(await coverStore.contains('lib-1', 'cov-1')).toBe(false);
  });
});

describe('SyncedCatalogStore', () => {
  let catalogStore: SyncedCatalogStore;

  beforeEach(() => {
    catalogStore = new SyncedCatalogStore();
  });

  test('stages, writes and publishes catalog atomically', async () => {
    const libId = 'lib-uuid';
    const rev = 'lib-uuid:1';

    expect(await catalogStore.activeIdentity(libId)).toBeNull();

    const nextOffset = await catalogStore.beginCatalogStage(libId, rev, 2);
    expect(nextOffset).toBe(0);

    await catalogStore.writeCatalogPage({
      libraryId: libId,
      revision: rev,
      total: 2,
      offset: 0,
      nextOffset: 2,
      songs: [
        {
          id: 10,
          title: 'Track A',
          artist: 'Artist A',
          album: 'Album 1',
          albumArtist: 'Artist A',
          genre: 'Electronic',
          trackNumber: 1,
          discNumber: 1,
          albumKey: 'a2-key1',
          artists: ['Artist A'],
        },
        {
          id: 11,
          title: 'Track B',
          artist: 'Artist B',
          album: 'Album 1',
          albumArtist: 'Artist A',
          genre: 'Electronic',
          trackNumber: 2,
          discNumber: 1,
          albumKey: 'a2-key1',
          artists: ['Artist B', 'Artist A'],
        },
      ],
    });

    // Before publish, active revision is still not visible
    expect(await catalogStore.activeIdentity(libId)).toBeNull();

    await catalogStore.publishCatalog(libId, rev, 2);

    const active = await catalogStore.activeIdentity(libId);
    expect(active?.revision).toBe(rev);
    expect(active?.total).toBe(2);
    expect(await catalogStore.activeSongCount(libId, rev)).toBe(2);

    // Query songs
    const page = await catalogStore.songPage(libId, rev, 0, 10);
    expect(page.total).toBe(2);
    expect(page.songs.length).toBe(2);
    expect(page.songs[0]?.title).toBe('Track A');

    // Query groups: Artists
    const artists = await catalogStore.groups(libId, rev, 'Artist');
    expect(artists.map((a) => a.name)).toEqual(['Artist A', 'Artist B']);

    // Query groups: Albums
    const albums = await catalogStore.groups(libId, rev, 'Album');
    expect(albums.length).toBe(1);
    expect(albums[0]?.name).toBe('Album 1');
    expect(albums[0]?.albumArtist).toBe('Artist A');
    expect(albums[0]?.count).toBe(2);
  });

  test('covers staging and state transitions', async () => {
    const libId = 'lib-covers';
    const rev = 'rev-1';

    // Must have active catalog first
    await catalogStore.beginCatalogStage(libId, rev, 1);
    await catalogStore.writeCatalogPage({
      libraryId: libId,
      revision: rev,
      total: 1,
      offset: 0,
      nextOffset: 1,
      songs: [
        {
          id: 1,
          title: 'Song',
          artist: 'Artist',
          album: 'Album',
          albumArtist: 'Artist',
          genre: 'Rock',
          trackNumber: 1,
          discNumber: 1,
          albumKey: 'a2-alb',
          artists: ['Artist'],
        },
      ],
    });
    await catalogStore.publishCatalog(libId, rev, 1);

    const progress = await catalogStore.beginCovers(libId, rev, 1);
    expect(progress.manifestComplete).toBe(false);

    await catalogStore.writeCoverPage({
      libraryId: libId,
      revision: rev,
      total: 1,
      offset: 0,
      nextOffset: 1,
      covers: [
        {
          albumKey: 'a2-alb',
          representativeId: 1,
          coverKey: 's-cov1',
          available: true,
        },
      ],
    });

    await catalogStore.publishCovers(libId, rev, 1);

    const updatedProg = await catalogStore.coverProgress(libId, rev);
    expect(updatedProg?.manifestComplete).toBe(true);

    const pending = await catalogStore.pendingCovers(libId, rev);
    expect(pending.length).toBe(1);
    expect(pending[0]?.coverKey).toBe('s-cov1');

    await catalogStore.markCoverState(libId, rev, 'a2-alb', COVER_STORED);
    expect((await catalogStore.pendingCovers(libId, rev)).length).toBe(0);
    expect(await catalogStore.completedCoverCount(libId, rev)).toBe(1);
  });
});

describe('CatalogSyncWorker', () => {
  let mockTransport: jest.Mocked<HttpTransport>;
  let api: RemoteApi;
  let catalogStore: SyncedCatalogStore;
  let coverStore: SyncedCoverStore;
  let worker: CatalogSyncWorker;

  beforeEach(() => {
    mockTransport = {
      execute: jest.fn(),
    };
    api = new RemoteApi(mockTransport, '123456');
    catalogStore = new SyncedCatalogStore();
    coverStore = new SyncedCoverStore('/tmp/test-covers/');
    worker = new CatalogSyncWorker();
  });

  test('skips full catalog sync if snapshot matches', async () => {
    const libId = 'lib-snap';
    const rev = 'rev-snap';

    // Pre-populate store
    await catalogStore.beginCatalogStage(libId, rev, 1);
    await catalogStore.writeCatalogPage({
      libraryId: libId,
      revision: rev,
      total: 1,
      offset: 0,
      nextOffset: 1,
      songs: [
        {
          id: 1,
          title: 'S',
          artist: 'A',
          album: 'Alb',
          albumArtist: 'A',
          genre: 'G',
          trackNumber: 1,
          discNumber: 1,
          albumKey: 'k1',
          artists: ['A'],
        },
      ],
    });
    await catalogStore.publishCatalog(libId, rev, 1);

    // Mock first page probe
    mockTransport.execute.mockImplementation(async (req) => {
      if (req.target.includes('/catalog/covers')) {
        return new HttpResponse(
          200,
          'OK',
          { 'content-type': 'application/json' },
          new TextEncoder().encode(
            JSON.stringify({
              library_id: libId,
              revision: rev,
              total: 0,
              offset: 0,
              next_offset: 0,
              covers: [],
            })
          )
        );
      }
      if (req.target.includes('/catalog')) {
        return new HttpResponse(
          200,
          'OK',
          { 'content-type': 'application/json' },
          new TextEncoder().encode(
            JSON.stringify({
              library_id: libId,
              revision: rev,
              total: 1,
              offset: 0,
              next_offset: 1,
              songs: [
                {
                  id: 1,
                  title: 'S',
                  artist: 'A',
                  album: 'Alb',
                  album_artist: 'A',
                  genre: 'G',
                  track_number: 1,
                  disc_number: 1,
                  album_key: 'k1',
                  artists: ['A'],
                },
              ],
            })
          )
        );
      }
      return new HttpResponse(404, 'Not Found', {}, new Uint8Array());
    });

    const progressUpdates: string[] = [];
    await worker.runSync(api, catalogStore, coverStore, {
      transport: 'wifi',
      isPlaying: false,
      onProgress: (p) => progressUpdates.push(p.message),
    });

    // Should not have fetched page 2 or redownloaded
    expect(progressUpdates).toContain('Checking catalog revision…');
    expect(progressUpdates).toContain('Catalog sync complete');
  });
});
