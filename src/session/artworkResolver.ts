import { ArtworkDiskCache } from '../data/ArtworkDiskCache';
import { RemoteApi } from '../data/RemoteApi';
import { CatalogIdentity, StoredCatalogCover } from '../data/SyncedCatalogStore';
import { SyncedCoverStore } from '../data/SyncedCoverStore';

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

async function syncedCoverUri(albumKey: string, sources: ArtworkSources): Promise<string | null> {
  if (!sources.catalog || sources.isCurrent?.() === false) return null;
  const cached = sources.coverUrisByAlbum.get(albumKey);
  if (cached) return cached;
  const cover = sources.coversByAlbum.get(albumKey);
  if (!cover) return null;
  const uri = await sources.coverStore.getUri(sources.catalog.libraryId, cover.coverKey);
  if (sources.isCurrent?.() === false) return null;
  if (uri) sources.coverUrisByAlbum.set(albumKey, uri);
  return uri;
}

async function songArtUri(songIndex: number, sources: ArtworkSources): Promise<string | null> {
  // Song indexes are local to a player's library. Scope persistent art by the
  // catalog identity so another player reusing the same index cannot show it.
  const catalog = sources.catalog;
  const scope = `${sources.playerScope ? `player:${encodeURIComponent(sources.playerScope)}:` : ''}${catalog
    ? `catalog:${encodeURIComponent(catalog.libraryId)}:${encodeURIComponent(catalog.revision)}:`
    : ''}`;
  const cacheKey = scope ? `${scope}song:${songIndex}` : null;
  const diskUri = cacheKey ? await sources.artCache.getUri(cacheKey) : null;
  if (diskUri || !sources.network) return diskUri;
  try {
    const art = await sources.network.art(songIndex);
    if (!art?.base64) return null;
    if (cacheKey) {
      await sources.artCache.put(cacheKey, art.base64);
      const cached = await sources.artCache.getUri(cacheKey);
      if (cached) return cached;
    }
    return `data:${art.contentType || 'image/jpeg'};base64,${art.base64}`;
  } catch {
    return null;
  }
}

export async function resolveArtworkUri({ albumKey, songIndex }: ArtworkTarget, sources: ArtworkSources): Promise<string | null> {
  const cover = albumKey ? await syncedCoverUri(albumKey, sources) : null;
  if (cover) return cover;
  return songIndex != null ? await songArtUri(songIndex, sources) : null;
}
