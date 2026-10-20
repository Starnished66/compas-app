import { ArtworkDiskCache } from '../../data/ArtworkDiskCache';
import { RemoteApi } from '../../data/RemoteApi';
import { SyncedCoverStore } from '../../data/SyncedCoverStore';
import { ArtworkSources, resolveArtworkUri } from '../artworkResolver';

function sources(libraryId: string, art: string | null, stored: Map<string, string>, requests: number[]): ArtworkSources {
  const artCache = {
    async getUri(key: number | string) {
      return stored.get(String(key)) ?? null;
    },
    async put(key: number | string, value: string) {
      stored.set(String(key), `data:image/jpeg;base64,${value}`);
    },
  } as unknown as ArtworkDiskCache;
  const network = {
    async art(index: number) {
      requests.push(index);
      return art ? { base64: art, contentType: 'image/jpeg' } : null;
    },
  } as unknown as RemoteApi;
  return {
    catalog: { libraryId, revision: 'rev-1', total: 1 },
    coverUrisByAlbum: new Map(),
    coversByAlbum: new Map(),
    coverStore: {} as SyncedCoverStore,
    artCache,
    network,
  };
}

describe('library artwork cache identity', () => {
  it('does not reuse a song index cache entry across player libraries', async () => {
    const stored = new Map<string, string>();
    const requests: number[] = [];
    const firstPlayer = sources('library-one', 'first-player-art', stored, requests);
    const secondPlayer = sources('library-two', 'second-player-art', stored, requests);

    await expect(resolveArtworkUri({ albumKey: null, songIndex: 12 }, firstPlayer)).resolves.toBe(
      'data:image/jpeg;base64,first-player-art',
    );
    await expect(resolveArtworkUri({ albumKey: null, songIndex: 12 }, secondPlayer)).resolves.toBe(
      'data:image/jpeg;base64,second-player-art',
    );
    await expect(resolveArtworkUri({ albumKey: null, songIndex: 12 }, firstPlayer)).resolves.toBe(
      'data:image/jpeg;base64,first-player-art',
    );
    expect(requests).toEqual([12, 12]);
  });

  it('does not reuse a song index cache entry after a catalog revision', async () => {
    const stored = new Map<string, string>();
    const requests: number[] = [];
    const current = sources('same-library', 'current-art', stored, requests);
    const nextRevision = { ...current, catalog: { libraryId: 'same-library', revision: 'rev-2', total: 1 } };

    await resolveArtworkUri({ albumKey: null, songIndex: 7 }, current);
    await expect(resolveArtworkUri({ albumKey: null, songIndex: 7 }, nextRevision)).resolves.toBe(
      'data:image/jpeg;base64,current-art',
    );
    expect(requests).toEqual([7, 7]);
  });

  it('ignores legacy unscoped song-index cache entries when no player identity is known', async () => {
    const stored = new Map<string, string>([['12', 'data:image/jpeg;base64,old-player-art']]);
    const requests: number[] = [];
    const current = sources('temporary', 'fresh-player-art', stored, requests);
    current.catalog = null;
    current.playerScope = null;

    await expect(resolveArtworkUri({ albumKey: null, songIndex: 12 }, current)).resolves.toBe(
      'data:image/jpeg;base64,fresh-player-art',
    );
    expect(requests).toEqual([12]);
    expect(stored.get('12')).toBe('data:image/jpeg;base64,old-player-art');
  });

  it('does not return a cached art image when another endpoint has no artwork at the same index', async () => {
    const stored = new Map<string, string>();
    const requests: number[] = [];
    const firstPlayer = sources('unused-one', 'first-art', stored, requests);
    firstPlayer.catalog = null;
    firstPlayer.playerScope = '192.168.1.10';
    const secondPlayer = sources('unused-two', null, stored, requests);
    secondPlayer.catalog = null;
    secondPlayer.playerScope = '192.168.1.211';

    await resolveArtworkUri({ albumKey: null, songIndex: 1 }, firstPlayer);
    await expect(resolveArtworkUri({ albumKey: null, songIndex: 1 }, secondPlayer)).resolves.toBeNull();
    expect(requests).toEqual([1, 1]);
  });

  it('does not publish a delayed synced-cover lookup into a cache after ownership changes', async () => {
    let finish!: (uri: string | null) => void;
    let current = true;
    const cachedUris = new Map<string, string>();
    const base = sources('library-one', 'unused', new Map(), []);
    base.coversByAlbum.set('album-key', {
      albumKey: 'album-key', representativeId: 1, coverKey: 'cover-key', available: true, downloadState: 0,
    });
    base.isCurrent = () => current;
    base.coverStore = {
      getUri: () => new Promise((resolve) => { finish = resolve; }),
    } as unknown as SyncedCoverStore;
    base.coverUrisByAlbum = cachedUris;

    const pending = resolveArtworkUri({ albumKey: 'album-key', songIndex: null }, base);
    current = false;
    finish('file:///old-player.cover');
    await expect(pending).resolves.toBeNull();
    expect(cachedUris.size).toBe(0);
  });
});
