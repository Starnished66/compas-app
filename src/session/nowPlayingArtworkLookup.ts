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

async function syncedAlbumCover(track: TrackIdentity, deps: NowPlayingArtworkDeps): Promise<string | null> {
  const sources = deps.sources();
  if (!sources.catalog) return null;
  const { libraryId, revision } = sources.catalog;
  const albumKey = await deps.catalogStore.findAlbumKey(libraryId, revision, track.title, track.artist, track.album);
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
  commandGeneration: number
): Promise<string | null> {
  if (!key) {
    const art = await api.art(null);
    ensureTrackUnchanged(api, commandGeneration);
    return art?.base64 ? `data:${art.contentType || 'image/jpeg'};base64,${art.base64}` : null;
  }
  if (api.canDownloadArt) {
    return cache.store(key, async (fileUri) => {
      const stored = await api.downloadArt(fileUri);
      ensureTrackUnchanged(api, commandGeneration);
      return stored;
    });
  }
  const art = await api.art(null);
  ensureTrackUnchanged(api, commandGeneration);
  if (!art?.base64) return null;
  await cache.put(key, art.base64);
  return (await cache.getUri(key)) ?? `data:${art.contentType || 'image/jpeg'};base64,${art.base64}`;
}

export function createNowPlayingArtworkLookup(deps: NowPlayingArtworkDeps): NowPlayingArtworkLookup {
  return {
    async local(track) {
      const cover = await syncedAlbumCover(track, deps).catch(() => null);
      const sources = deps.sources();
      const key = nowPlayingCacheKey(track, sources.catalog, sources.playerScope);
      return cover ?? (key ? sources.artCache.getUri(key) : null);
    },
    async remote(track, commandGeneration) {
      const api = deps.api();
      if (!api) throw new Error('Player is not connected');
      ensureTrackUnchanged(api, commandGeneration);
      deps.onRemoteRequest();
      const sources = deps.sources();
      return fetchCurrentArt(
        api,
        sources.artCache,
        nowPlayingCacheKey(track, sources.catalog, sources.playerScope),
        commandGeneration,
      );
    },
  };
}
