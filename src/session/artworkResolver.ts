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
}

async function syncedCoverUri(albumKey: string, sources: ArtworkSources): Promise<string | null> {
  if (!sources.catalog) return null;
  const cached = sources.coverUrisByAlbum.get(albumKey);
  if (cached) return cached;
  const cover = sources.coversByAlbum.get(albumKey);
  if (!cover) return null;
  const uri = await sources.coverStore.getUri(sources.catalog.libraryId, cover.coverKey);
  if (uri) sources.coverUrisByAlbum.set(albumKey, uri);
  return uri;
}

async function songArtUri(songIndex: number, sources: ArtworkSources): Promise<string | null> {
  const diskUri = await sources.artCache.getUri(songIndex);
  if (diskUri || !sources.network) return diskUri;
  try {
    const art = await sources.network.art(songIndex);
    if (!art?.base64) return null;
    await sources.artCache.put(songIndex, art.base64);
    return (await sources.artCache.getUri(songIndex)) ?? `data:${art.contentType || 'image/jpeg'};base64,${art.base64}`;
  } catch {
    return null;
  }
}

export async function resolveArtworkUri({ albumKey, songIndex }: ArtworkTarget, sources: ArtworkSources): Promise<string | null> {
  const cover = albumKey ? await syncedCoverUri(albumKey, sources) : null;
  if (cover) return cover;
  return songIndex != null ? await songArtUri(songIndex, sources) : null;
}
