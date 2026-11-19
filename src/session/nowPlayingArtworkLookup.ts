import { ArtworkDiskCache } from '../data/ArtworkDiskCache';
import { RemoteApi } from '../data/RemoteApi';
import { CatalogIdentity, SyncedCatalogStore } from '../data/SyncedCatalogStore';
import { TrackIdentity, trackKey } from '../ui/trackKey';
import { ArtworkSources, resolveArtworkUri } from './artworkResolver';
import { NowPlayingArtworkLookup } from './NowPlayingArtwork';

export interface NowPlayingArtworkDeps {
  sources(): ArtworkSources;
  catalogStore: SyncedCatalogStore;
  api(): RemoteApi | null;
  onRemoteRequest(): void;
}

export function nowPlayingCacheKey(
  track: TrackIdentity,
  catalog?: CatalogIdentity | null,
  playerScope?: string | null,
): string | null {
  if (!catalog && !playerScope) return null;
  const scope = `${playerScope ? `player:${encodeURIComponent(playerScope)}:` : ''}${catalog
    ? `catalog:${encodeURIComponent(catalog.libraryId)}:${encodeURIComponent(catalog.revision)}:`
    : ''}`;
  return `${scope}now-playing:${encodeURIComponent(trackKey(track)!)}`;
}

async function syncedAlbumCover(
  track: TrackIdentity,
  sources: ArtworkSources,
  catalogStore: SyncedCatalogStore,
): Promise<string | null> {
  if (!sources.catalog) return null;
  const { libraryId, revision } = sources.catalog;
  const albumKey = await catalogStore.findAlbumKey(libraryId, revision, track.title, track.artist, track.album);
  if (sources.isCurrent?.() === false) return null;
  return albumKey ? resolveArtworkUri({ albumKey, songIndex: null }, { ...sources, network: null }) : null;
}

function ensureTrackUnchanged(api: RemoteApi, commandGeneration: number): void {
  if (api.commandGeneration !== commandGeneration) {
    throw new Error('A player command may have changed the track during the artwork request');
  }
}

async function fetchCurrentArt(
  api: RemoteApi,
  cache: ArtworkDiskCache,
  key: string | null,
  commandGeneration: number,
  isCurrent: () => boolean,
): Promise<string | null> {
  const ownsWrite = () => {
    if (!isCurrent()) return false;
    ensureTrackUnchanged(api, commandGeneration);
    return true;
  };
  if (key && api.canDownloadArt) {
    return cache.store(key, (fileUri) => api.downloadArt(fileUri), ownsWrite);
  }
  const art = await api.art(null);
  if (!ownsWrite() || !art?.base64) return null;
  const fallback = `data:${art.contentType || 'image/jpeg'};base64,${art.base64}`;
  if (!key) return fallback;
  await cache.put(key, art.base64, ownsWrite);
  if (!ownsWrite()) return null;
  const cached = await cache.getUri(key);
  return ownsWrite() ? cached ?? fallback : null;
}

export function createNowPlayingArtworkLookup(deps: NowPlayingArtworkDeps): NowPlayingArtworkLookup {
  return {
    async local(track) {
      const sources = deps.sources();
      const cover = await syncedAlbumCover(track, sources, deps.catalogStore).catch(() => null);
      if (sources.isCurrent?.() === false) return null;
      const key = nowPlayingCacheKey(track, sources.catalog, sources.playerScope);
      return cover ?? (key ? sources.artCache.getUri(key) : null);
    },
    async remote(track, commandGeneration, ownsLookup) {
      const api = deps.api();
      if (!api) throw new Error('Player is not connected');
      const isCurrent = () => ownsLookup() && deps.api() === api;
      if (!isCurrent()) return null;
      ensureTrackUnchanged(api, commandGeneration);
      deps.onRemoteRequest();
      const sources = deps.sources();
      const artwork = await fetchCurrentArt(
        api,
        sources.artCache,
        nowPlayingCacheKey(track, sources.catalog, sources.playerScope),
        commandGeneration,
        isCurrent,
      );
      if (!isCurrent()) return null;
      ensureTrackUnchanged(api, commandGeneration);
      return artwork;
    },
  };
}
