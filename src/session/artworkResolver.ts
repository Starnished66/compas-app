import { ArtworkDiskCache } from '../data/ArtworkDiskCache';
import { ArtworkDestinationError } from '../data/HttpTransport';
import { ArtworkReference, readArtwork } from '../data/MemoryArtworkCache';
import { RemoteApi } from '../data/RemoteApi';
import { CatalogIdentity, StoredCatalogCover } from '../data/SyncedCatalogStore';
import { SyncedCoverStore } from '../data/SyncedCoverStore';
import type { EntryTarget } from './LibraryEntryFactory';

export interface ArtworkTarget {
  albumKey: string | null;
  songIndex: number | null;
}

export interface ArtworkSources {
  catalog: CatalogIdentity | null;
  coverUrisByAlbum: Map<string, string>;
  coversByAlbum: Map<string, StoredCatalogCover>;
  coverStore: SyncedCoverStore;
  artCache: ArtworkDiskCache;
  network: RemoteApi | null;
  playerScope?: string | null;
  isCurrent?: () => boolean;
}

export function artworkTarget(target: EntryTarget, playlistTarget: (key: string) => ArtworkTarget | undefined): ArtworkTarget {
  if (target.type === 'Playlist') return playlistTarget(target.playlist.key) ?? { albumKey: null, songIndex: null };
  const item = target.type === 'Song' ? target.song : target.type === 'Album' || target.type === 'Group' ? target.group : null;
  return { albumKey: item?.albumKey ?? null, songIndex: item?.index ?? null };
}

function albumMemoryLookup(albumKey: string, sources: ArtworkSources): (() => string | null) | null {
  const libraryId = sources.catalog?.libraryId;
  const coverKey = sources.coversByAlbum.get(albumKey)?.coverKey;
  const { coverStore } = sources;
  return libraryId && coverKey ? () => coverStore.getMemoryUri(libraryId, coverKey) : null;
}

export function cachedAlbumArtwork(albumKey: string, sources: ArtworkSources): ArtworkReference | null {
  const file = sources.coverUrisByAlbum.get(albumKey);
  if (file) return file;
  const read = albumMemoryLookup(albumKey, sources);
  return read?.() ? read : null;
}

async function syncedCoverUri(albumKey: string, sources: ArtworkSources): Promise<ArtworkReference | null> {
  if (!sources.catalog || sources.isCurrent?.() === false) return null;
  const cached = sources.coverUrisByAlbum.get(albumKey);
  if (cached) return cached;
  const cover = sources.coversByAlbum.get(albumKey);
  if (!cover) return null;
  const uri = await sources.coverStore.getUri(sources.catalog.libraryId, cover.coverKey);
  if (sources.isCurrent?.() === false) return null;
  if (!uri) return null;
  if (uri.startsWith('file:')) {
    sources.coverUrisByAlbum.set(albumKey, uri);
    return uri;
  }
  return albumMemoryLookup(albumKey, sources);
}

async function songArtUri(songIndex: number, sources: ArtworkSources): Promise<ArtworkReference | null> {
  // Song indexes are local to a player's library. Scope persistent art by the
  // catalog identity so another player reusing the same index cannot show it.
  const catalog = sources.catalog;
  const scope = `${sources.playerScope ? `player:${encodeURIComponent(sources.playerScope)}:` : ''}${catalog
    ? `catalog:${encodeURIComponent(catalog.libraryId)}:${encodeURIComponent(catalog.revision)}:`
    : ''}`;
  const cacheKey = scope ? `${scope}song:${songIndex}` : null;
  const diskUri = cacheKey ? await sources.artCache.getUri(cacheKey) : null;
  if (sources.isCurrent?.() === false) return null;
  if (diskUri) return diskUri;
  const memory = cacheKey ? sources.coverStore.indexedArtwork(cacheKey) : null;
  if (memory || !sources.network) return memory;
  const { network, artCache, isCurrent } = sources;
  const owns = isCurrent ?? (() => true);
  try {
    if (cacheKey && network.canDownloadLibraryArt) {
      let downloading = false;
      try {
        return await artCache.store(cacheKey, async (fileUri) => {
          downloading = true;
          const found = await network.downloadArt(fileUri, songIndex);
          downloading = false;
          return found;
        }, owns);
      } catch (error) {
        if (!owns() || (downloading && !(error instanceof ArtworkDestinationError))) throw error;
      }
    }
    const art = await network.art(songIndex);
    if (!owns() || !art?.base64) return null;
    let cached: string | null = null;
    if (cacheKey) {
      await artCache.put(cacheKey, art.base64, owns);
      if (!owns()) return null;
      cached = await artCache.getUri(cacheKey);
    }
    if (!owns()) return null;
    return cached ?? sources.coverStore.rememberIndexedArtwork(cacheKey, art.base64, art.contentType || 'image/jpeg');
  } catch {
    return null;
  }
}

export async function resolveArtworkReference({ albumKey, songIndex }: ArtworkTarget, sources: ArtworkSources): Promise<ArtworkReference | null> {
  const cover = albumKey ? await syncedCoverUri(albumKey, sources) : null;
  if (sources.isCurrent?.() === false) return null;
  if (cover) return cover;
  return songIndex != null ? await songArtUri(songIndex, sources) : null;
}

export async function resolveArtworkUri(target: ArtworkTarget, sources: ArtworkSources): Promise<string | null> {
  const artwork = await resolveArtworkReference(target, sources);
  if (sources.isCurrent?.() === false) return null;
  return readArtwork(artwork) ?? null;
}

export async function fetchCatalogCover(
  network: RemoteApi,
  store: SyncedCoverStore,
  catalog: CatalogIdentity,
  { coverKey, representativeId }: StoredCatalogCover,
  request: <T>(read: () => Promise<T>) => Promise<T>,
  owns: () => boolean,
): Promise<{ uri: string | null; onDisk: boolean }> {
  const { libraryId, revision } = catalog;
  if (network.canDownloadLibraryArt) {
    const uri = await store.storeDownload(libraryId, coverKey, (fileUri) =>
      request(() => network.downloadCatalogArt(fileUri, revision, representativeId, coverKey)).catch((error) => {
        if (error instanceof ArtworkDestinationError) return undefined;
        throw error;
      }), owns);
    if (uri !== undefined || !owns()) return { uri: uri ?? null, onDisk: Boolean(uri) };
  }
  const art = await request(() => network.catalogArt(revision, representativeId, coverKey));
  if (!owns() || !art?.base64) return { uri: null, onDisk: false };
  const uri = await store.put(libraryId, coverKey, art.base64, owns, art.contentType || 'image/jpeg');
  if (!owns()) return { uri: null, onDisk: false };
  if (uri) return { uri, onDisk: true };
  const fallback = store.getMemoryUri(libraryId, coverKey) ?? `data:${art.contentType || 'image/jpeg'};base64,${art.base64}`;
  return { uri: fallback, onDisk: false };
}
