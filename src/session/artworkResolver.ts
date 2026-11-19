import { ArtworkDiskCache } from '../data/ArtworkDiskCache';
import { ArtworkDestinationError } from '../data/HttpTransport';
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
  if (sources.isCurrent?.() === false) return null;
  if (diskUri || !sources.network) return diskUri;
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
    return owns() ? cached ?? `data:${art.contentType || 'image/jpeg'};base64,${art.base64}` : null;
  } catch {
    return null;
  }
}

export async function resolveArtworkUri({ albumKey, songIndex }: ArtworkTarget, sources: ArtworkSources): Promise<string | null> {
  const cover = albumKey ? await syncedCoverUri(albumKey, sources) : null;
  if (sources.isCurrent?.() === false) return null;
  if (cover) return cover;
  return songIndex != null ? await songArtUri(songIndex, sources) : null;
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
  const uri = await store.put(libraryId, coverKey, art.base64, owns);
  if (!owns()) return { uri: null, onDisk: false };
  return { uri: uri ?? `data:${art.contentType || 'image/jpeg'};base64,${art.base64}`, onDisk: Boolean(uri) };
}
