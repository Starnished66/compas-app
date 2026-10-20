jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async () => {
    throw new Error('expo-crypto is unavailable under Jest');
  },
}));
jest.mock('expo-file-system/legacy', () => ({ cacheDirectory: 'file:///cache/', documentDirectory: 'file:///docs/' }));

import { ArtworkDiskCache } from '../../data/ArtworkDiskCache';
import { FetchHttpTransport, FileDownloader, SerializedHttpTransport } from '../../data/HttpTransport';
import { RemoteApi } from '../../data/RemoteApi';
import { SyncedCatalogStore } from '../../data/SyncedCatalogStore';
import { SyncedCoverStore } from '../../data/SyncedCoverStore';
import { ArtworkSources } from '../artworkResolver';
import { createNowPlayingArtworkLookup, nowPlayingCacheKey } from '../nowPlayingArtworkLookup';

const track = { title: 'Señorita', artist: 'Artist', album: 'Album' };

function fakeCache() {
  const stored = new Map<string, string>();
  const cache = {
    async getUri(key: string) {
      return stored.get(key) ?? null;
    },
    async store(key: string, write: (fileUri: string) => Promise<boolean>) {
      if (!(await write(`file:///cache/${key}.tmp`))) return null;
      stored.set(key, `file:///cache/${key}.art`);
      return stored.get(key)!;
    },
  };
  return { stored, cache: cache as unknown as ArtworkDiskCache };
}

function sourcesWith(artCache: ArtworkDiskCache, catalog: ArtworkSources['catalog'] = null): ArtworkSources {
  return {
    catalog,
    coverUrisByAlbum: new Map([['album-key', 'file:///docs/synced-covers/lib/album.cover']]),
    coversByAlbum: new Map(),
    coverStore: {} as SyncedCoverStore,
    artCache,
    network: null,
    playerScope: 'test-player',
  };
}

function setup(download: FileDownloader, catalogAlbumKey: string | null = null) {
  const { stored, cache } = fakeCache();
  const api = new RemoteApi(new SerializedHttpTransport(new FetchHttpTransport('http://player', 8000, download)));
  const remoteRequests: number[] = [];
  const catalogStore = { findAlbumKey: async () => catalogAlbumKey } as unknown as SyncedCatalogStore;
  const lookup = createNowPlayingArtworkLookup({
    sources: () => sourcesWith(cache, catalogAlbumKey ? { libraryId: 'lib', revision: 'r1', total: 1 } : null),
    catalogStore,
    api: () => api,
    onRemoteRequest: () => remoteRequests.push(Date.now()),
  });
  return { api, lookup, stored, remoteRequests };
}

const okDownload: FileDownloader = async () => ({ status: 200, headers: {}, errorBody: '' });

describe('now-playing artwork lookup', () => {
  it('uses the synced album cover for the playing track', async () => {
    const { lookup } = setup(okDownload, 'album-key');
    await expect(lookup.local(track)).resolves.toBe('file:///docs/synced-covers/lib/album.cover');
  });

  it('caches downloaded artwork under an ASCII key for the track', async () => {
    const { api, lookup, stored, remoteRequests } = setup(okDownload);
    await expect(lookup.local(track)).resolves.toBeNull();

    const uri = await lookup.remote(track, api.commandGeneration);
    const cacheKey = nowPlayingCacheKey(track, null, 'test-player');
    expect(cacheKey).toMatch(/^[\x20-\x7e]+$/);
    expect(uri).toBe(stored.get(cacheKey!));
    expect(remoteRequests).toHaveLength(1);
    await expect(lookup.local(track)).resolves.toBe(uri);
  });

  it('scopes the same track key to its player and catalog revision', () => {
    const catalog = { libraryId: 'library-one', revision: 'rev-1', total: 1 };
    const otherPlayer = nowPlayingCacheKey(track, catalog, '192.168.1.211');
    const samePlayerNewRevision = nowPlayingCacheKey(
      track,
      { ...catalog, revision: 'rev-2' },
      '192.168.1.211',
    );
    const differentPlayer = nowPlayingCacheKey(track, catalog, 'bluetooth:device-two');

    expect(otherPlayer).not.toBe(samePlayerNewRevision);
    expect(otherPlayer).not.toBe(differentPlayer);
    expect(nowPlayingCacheKey(track)).toBeNull();
  });

  it('discards artwork downloaded while a player command was sent', async () => {
    let finishDownload!: () => void;
    const download: FileDownloader = () =>
      new Promise((resolve) => {
        finishDownload = () => resolve({ status: 200, headers: {}, errorBody: '' });
      });
    const { api, lookup, stored } = setup(download);
    const generation = api.commandGeneration;

    const pending = lookup.remote(track, generation);
    await new Promise<void>((resolve) => setImmediate(resolve));
    void api.setVolume(40).catch(() => {});
    finishDownload();

    await expect(pending).rejects.toThrow('changed the track');
    expect(stored.size).toBe(0);
  });

  it('skips the request when a command was sent after the status was read', async () => {
    const { api, lookup, remoteRequests } = setup(okDownload);
    const generation = api.commandGeneration;
    void api.next().catch(() => {});
    await expect(lookup.remote(track, generation)).rejects.toThrow('changed the track');
    expect(remoteRequests).toHaveLength(0);
  });
});
