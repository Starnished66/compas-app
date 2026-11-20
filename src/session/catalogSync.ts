import type { SyncedCoverStore } from '../data/SyncedCoverStore';
import type { SessionState } from './useSessionRefs';
import { RemoteApi } from '../data/RemoteApi';
import { SyncedCatalogStore, CatalogIdentity, StoredCatalogCover } from '../data/SyncedCatalogStore';
import { LocalCatalogUnavailableError } from '../data/catalogDatabase';
import { fetchCatalogCover } from './artworkResolver';
import { BluetoothRequestPolicy } from './BluetoothRequestPolicy';
import { LocalCatalogOpenError } from '../data/catalogDatabase';
import type { CatalogCoverProgress } from '../data/SyncedCatalogStore';
import { matchesStoredCatalogSnapshot } from './CatalogSyncPolicy';

const CATALOG_SYNC_RETRY_DELAYS_MS = [2000, 5000, 15000];

interface CatalogSyncContext {
  api: Pick<RemoteApi, 'catalog' | 'catalogCovers'>;
  store: SyncedCatalogStore;
  isCurrent: () => boolean;
  request: <T>(request: () => Promise<T>) => Promise<T>;
  setMessage: (message: string | null) => void;
  adopt: (identity: CatalogIdentity) => void;
  setCovers: (covers: StoredCatalogCover[]) => void;
  finishCovers: (identity: CatalogIdentity, covers: StoredCatalogCover[]) => Promise<void>;
}

async function verifyCatalog(ctx: CatalogSyncContext): Promise<{
  identity: CatalogIdentity;
  complete: boolean;
} | null> {
  const { libraryId, revision, total } = await ctx.request(() => ctx.api.catalog(0, 1));
  if (!ctx.isCurrent()) return null;
  if (!libraryId.trim() || !revision.trim()) throw new Error('Player returned no catalog identity');
  const stored = await ctx.store.activeIdentity(libraryId);
  if (!ctx.isCurrent()) return null;
  const count = stored?.revision === revision && stored.total === total
    ? await ctx.store.activeSongCount(libraryId, revision)
    : undefined;
  return {
    identity: { libraryId, revision, total },
    complete: matchesStoredCatalogSnapshot(libraryId, revision, total, stored?.libraryId, stored?.revision, stored?.total, count),
  };
}

function checkPage(
  page: CatalogIdentity & { offset: number; nextOffset: number },
  identity: CatalogIdentity,
  offset: number
): void {
  if (page.libraryId !== identity.libraryId || page.revision !== identity.revision || page.total !== identity.total) {
    throw new Error('Player catalog changed during sync');
  }
  if (page.offset !== offset || (offset < page.total && page.nextOffset <= offset)) {
    throw new Error('Player catalog page did not advance');
  }
}

async function syncSongs(ctx: CatalogSyncContext, identity: CatalogIdentity): Promise<void> {
  const { libraryId, revision, total } = identity;
  ctx.setMessage('Syncing songs');
  let offset = await ctx.store.beginCatalogStage(libraryId, revision, total);
  while (ctx.isCurrent() && offset < total) {
    if (offset > 0) ctx.setMessage(`Syncing songs ${offset}/${total}`);
    const page = await ctx.request(() => ctx.api.catalog(offset, undefined, revision));
    if (!ctx.isCurrent()) return;
    checkPage(page, identity, offset);
    await ctx.store.writeCatalogPage(page);
    offset = page.nextOffset;
  }
  if (ctx.isCurrent()) await ctx.store.publishCatalog(libraryId, revision, total);
}

async function syncManifest(
  ctx: CatalogSyncContext, identity: CatalogIdentity, progress: CatalogCoverProgress | null,
  markRefreshStarted: (() => void) | null
): Promise<void> {
  const { libraryId, revision } = identity;
  ctx.setMessage('Syncing album covers');
  let stage = progress;
  if (!stage || markRefreshStarted) {
    const first = await ctx.request(() => ctx.api.catalogCovers(0, undefined, revision));
    if (!ctx.isCurrent()) return;
    checkPage(first, { libraryId, revision, total: first.total }, 0);
    stage = await ctx.store.beginCovers(libraryId, revision, first.total, markRefreshStarted != null);
    markRefreshStarted?.();
    if (!ctx.isCurrent()) return;
    if (stage.nextOffset === 0 && first.total > 0) {
      await ctx.store.writeCoverPage(first);
      stage.nextOffset = first.nextOffset;
    }
  }
  const manifest = { libraryId, revision, total: stage.total };
  let offset = stage.nextOffset;
  while (ctx.isCurrent() && offset < stage.total) {
    if (offset > 0) ctx.setMessage(`Syncing album covers ${offset}/${stage.total}`);
    const page = await ctx.request(() => ctx.api.catalogCovers(offset, undefined, revision));
    if (!ctx.isCurrent()) return;
    checkPage(page, manifest, offset);
    await ctx.store.writeCoverPage(page);
    offset = page.nextOffset;
  }
  if (ctx.isCurrent()) await ctx.store.publishCovers(libraryId, revision, stage.total);
}

async function readCovers(ctx: CatalogSyncContext, { libraryId, revision }: CatalogIdentity) {
  const covers = await ctx.store.catalogCovers(libraryId, revision);
  if (ctx.isCurrent()) ctx.setCovers(covers);
  return covers;
}

async function syncOnce(ctx: CatalogSyncContext, refresh: (identity: CatalogIdentity) => (() => void) | null) {
  const verified = await verifyCatalog(ctx);
  if (!verified || !ctx.isCurrent()) return;
  const { identity, complete } = verified;
  if (!complete) await syncSongs(ctx, identity);
  if (!ctx.isCurrent()) return;
  ctx.adopt(identity);

  const { libraryId, revision } = identity;
  let covers = complete ? await readCovers(ctx, identity) : null;
  if (!ctx.isCurrent()) return;
  const progress = await ctx.store.coverProgress(libraryId, revision);
  if (!ctx.isCurrent()) return;
  const markRefreshStarted = refresh(identity);
  if (complete && !markRefreshStarted && progress?.manifestComplete) {
    const hasPending = await ctx.store.hasPendingCovers(libraryId, revision);
    if (!ctx.isCurrent()) return;
    if (!hasPending) {
      ctx.setMessage(null);
      return;
    }
  }
  if (!progress?.manifestComplete || markRefreshStarted) {
    await syncManifest(ctx, identity, progress, markRefreshStarted);
    if (!ctx.isCurrent()) return;
    covers = null;
  }
  covers ??= await readCovers(ctx, identity);
  if (ctx.isCurrent()) await ctx.finishCovers(identity, covers);
}

export async function syncCatalog(ctx: CatalogSyncContext, refreshManifest: boolean): Promise<void> {
  let refreshed: CatalogIdentity | null = null;
  const refresh = (identity: CatalogIdentity) => refreshManifest &&
    (refreshed?.libraryId !== identity.libraryId || refreshed.revision !== identity.revision)
    ? () => { refreshed = identity; }
    : null;
  for (let retry = 0; ctx.isCurrent(); retry++) {
    try {
      await syncOnce(ctx, refresh);
      return;
    } catch (error) {
      if (!ctx.isCurrent()) return;
      if (retry >= CATALOG_SYNC_RETRY_DELAYS_MS.length || error instanceof LocalCatalogOpenError) throw error;
      ctx.setMessage('Waiting to retry library sync');
      await new Promise<void>((resolve) => setTimeout(resolve, CATALOG_SYNC_RETRY_DELAYS_MS[retry]));
    }
  }
}
interface CatalogSyncDependencies {
  shared: Pick<SessionState,
    'apiRef' | 'appForegroundRef' | 'bluetoothAudioOutputRef' | 'catalogCoversByAlbumRef'
    | 'catalogSyncGenerationRef' | 'catalogSyncProgress' | 'connectionAttemptRef' | 'gateRef'
    | 'lastBluetoothArtworkAtRef' | 'lastCatalogCoverProgressAtRef' | 'libraryBrowseCatalogRef'
    | 'queueArtworkBySongRef' | 'queueArtworkPendingRef' | 'stateRef' | 'syncedCatalogStoreRef'
    | 'syncedCoverStoreRef' | 'syncedCoverUriCacheRef'
  >;
  adoptCatalog: (identity: CatalogIdentity | null) => void;
  markCatalogUnavailable: () => void;
  restartCatalogBrowse: (api: RemoteApi, isNested: boolean, query: string) => void;
}

// Background Catalog Sync Worker
const catalogSyncIsCurrent = ({ shared }: CatalogSyncDependencies, api: RemoteApi, attempt: number, generation: number) => {
  const { apiRef, catalogSyncGenerationRef, connectionAttemptRef } = shared;
  return apiRef.current === api && attempt === connectionAttemptRef.current && generation === catalogSyncGenerationRef.current;
};

const startCatalogSync = async (
  deps: CatalogSyncDependencies,
  api: RemoteApi,
  attempt: number,
  features: string[],
  refreshCoversManifest: boolean = false
) => {
  const { shared, adoptCatalog, markCatalogUnavailable, restartCatalogBrowse } = deps;
  const {
    apiRef, catalogCoversByAlbumRef, catalogSyncGenerationRef, catalogSyncProgress,
    connectionAttemptRef, lastCatalogCoverProgressAtRef, libraryBrowseCatalogRef,
    queueArtworkBySongRef, queueArtworkPendingRef, stateRef, syncedCatalogStoreRef, syncedCoverUriCacheRef,
  } = shared;
  if (apiRef.current !== api || attempt !== connectionAttemptRef.current) return;
  const generation = ++catalogSyncGenerationRef.current;
  const ownsCatalogSync = () => catalogSyncIsCurrent(deps, api, attempt, generation);
  try {
    const supported = features.includes('catalog_sync_v1');
    if (!supported) {
      adoptCatalog(null);
      catalogCoversByAlbumRef.current = new Map();
      syncedCoverUriCacheRef.current = new Map();
      queueArtworkBySongRef.current.clear();
      queueArtworkPendingRef.current.clear();
      catalogSyncProgress.set(null);
      return;
    }

    syncedCoverUriCacheRef.current = new Map();
    queueArtworkBySongRef.current.clear();
    queueArtworkPendingRef.current.clear();
    lastCatalogCoverProgressAtRef.current = 0;
    catalogSyncProgress.set('Checking player library');

    await syncCatalog({
      api,
      store: syncedCatalogStoreRef.current,
      isCurrent: ownsCatalogSync,
      request: (request) => catalogNetwork(deps, api, attempt, generation, false, request),
      setMessage: catalogSyncProgress.set,
      adopt: adoptCatalog,
      setCovers: (covers) => {
        const coverMap = catalogCoversByAlbumRef.current;
        coverMap.clear();
        covers.forEach((cover) => coverMap.set(cover.albumKey, cover));
      },
      finishCovers: (identity, covers) => downloadCatalogCovers(deps, api, attempt, generation, identity, covers),
    }, refreshCoversManifest);
  } catch (error) {
    if (!ownsCatalogSync()) return;
    if (error instanceof LocalCatalogUnavailableError) {
      const restartBrowse = libraryBrowseCatalogRef.current;
      markCatalogUnavailable();
      if (restartBrowse) {
        const { libraryIsNested, libraryQuery } = stateRef.current;
        restartCatalogBrowse(api, libraryIsNested, libraryQuery);
      }
    } else {
      catalogSyncProgress.set('Library sync failed');
    }
  }
};

const catalogTransferAllowed = ({ shared }: CatalogSyncDependencies, optionalArtwork: boolean): boolean => {
  const { appForegroundRef, bluetoothAudioOutputRef, gateRef, stateRef } = shared;
  const transport = stateRef.current.connectionTransport;
  const route = bluetoothAudioOutputRef.current;
  if (!BluetoothRequestPolicy.allowsPassiveRequests(transport, appForegroundRef.current, route)) return false;
  if (BluetoothRequestPolicy.requiresBluetoothAudioPriority(transport, route)) {
    if (!appForegroundRef.current || !gateRef.current.confirmedPaused || stateRef.current.isPlaying) return false;
  }
  return !optionalArtwork || BluetoothRequestPolicy.allowsArtworkRequest(transport, stateRef.current.isPlaying, route);
};

const catalogNetwork = async <T,>(
  deps: CatalogSyncDependencies,
  api: RemoteApi,
  attempt: number,
  generation: number,
  optionalArtwork: boolean,
  request: () => Promise<T>
): Promise<T> => {
  const { bluetoothAudioOutputRef, catalogSyncProgress, lastBluetoothArtworkAtRef, stateRef } = deps.shared;
  while (catalogSyncIsCurrent(deps, api, attempt, generation)) {
    if (catalogTransferAllowed(deps, optionalArtwork)) {
      if (!optionalArtwork || !BluetoothRequestPolicy.requiresBluetoothAudioPriority(
        stateRef.current.connectionTransport,
        bluetoothAudioOutputRef.current
      ) || Date.now() - lastBluetoothArtworkAtRef.current >=
        BluetoothRequestPolicy.artworkMinIntervalMs(stateRef.current.connectionTransport, bluetoothAudioOutputRef.current)) {
        if (optionalArtwork && BluetoothRequestPolicy.requiresBluetoothAudioPriority(
          stateRef.current.connectionTransport,
          bluetoothAudioOutputRef.current
        )) lastBluetoothArtworkAtRef.current = Date.now();
        return await request();
      }
    }
    catalogSyncProgress.set(BluetoothRequestPolicy.requiresBluetoothAudioPriority(
      stateRef.current.connectionTransport,
      bluetoothAudioOutputRef.current
    ) ? 'Waiting for WiFi or paused Bluetooth audio' : 'Waiting to resume library sync');
    await new Promise<void>((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('Catalog sync no longer owns the active player session');
};

const storePendingCovers = async (
  deps: CatalogSyncDependencies,
  api: RemoteApi, activeIdentity: CatalogIdentity, allCovers: StoredCatalogCover[], pending: StoredCatalogCover[],
  coverStore: SyncedCoverStore, coverUriMap: Map<string, string>, ownsCoverDownloads: () => boolean,
  read: <T>(request: () => Promise<T>) => Promise<T>,
) => {
  const { catalogSyncProgress, lastCatalogCoverProgressAtRef, syncedCatalogStoreRef } = deps.shared;
  const downloadableTotal = allCovers.filter((c) => c.available !== false).length;
  let done = downloadableTotal - pending.length;
  // A cover cut off by a timeout or a server error gets one more try at the end of this pass.
  const requeued = new Set<string>();

  for (const cover of pending) {
    if (!ownsCoverDownloads()) return;
    const markCoverState = (state: number) =>
      syncedCatalogStoreRef.current.markCoverState(activeIdentity.libraryId, activeIdentity.revision, cover.albumKey, state);
    if (cover.available === false) {
      await markCoverState(SyncedCatalogStore.COVER_MISSING);
      done++;
      continue;
    }

    const progressTime = Date.now();
    if (progressTime - lastCatalogCoverProgressAtRef.current >= 2000) {
      lastCatalogCoverProgressAtRef.current = progressTime;
      catalogSyncProgress.set(`Downloading covers ${Math.min(done, downloadableTotal)}/${downloadableTotal}`);
    }

    try {
      const existing = await coverStore.getDiskUri(activeIdentity.libraryId, cover.coverKey);
      if (!ownsCoverDownloads()) return;
      const { uri, onDisk } = existing ? { uri: existing, onDisk: true } : await fetchCatalogCover(
        api, coverStore, activeIdentity, cover,
        read, ownsCoverDownloads,
      );
      if (!ownsCoverDownloads()) return;
      if (onDisk || !uri) {
        await markCoverState(onDisk ? SyncedCatalogStore.COVER_STORED : SyncedCatalogStore.COVER_MISSING);
      }
      if (!ownsCoverDownloads()) return;
      if (onDisk && uri) coverUriMap.set(cover.albumKey, uri);
    } catch (err: any) {
      if (!ownsCoverDownloads()) return;
      if (err instanceof LocalCatalogUnavailableError) throw err;
      if (err?.statusCode === 404) {
        await markCoverState(SyncedCatalogStore.COVER_MISSING);
      } else if (err?.statusCode === 413) {
        await markCoverState(SyncedCatalogStore.COVER_PERMANENT_FAILURE);
      } else if (!requeued.has(cover.albumKey)) {
        requeued.add(cover.albumKey);
        pending.push(cover);
        continue;
      }
    }
    done++;
  }

  if (ownsCoverDownloads()) catalogSyncProgress.set(null);
};

const downloadCatalogCovers = async (
  deps: CatalogSyncDependencies,
  api: RemoteApi,
  attempt: number,
  generation: number,
  activeIdentity: CatalogIdentity,
  allCovers: StoredCatalogCover[]
) => {
  const {
    catalogCoversByAlbumRef, syncedCatalogStoreRef, syncedCoverStoreRef, syncedCoverUriCacheRef,
  } = deps.shared;
  const ownsCatalogSync = () => catalogSyncIsCurrent(deps, api, attempt, generation);
  const coverMap = catalogCoversByAlbumRef.current;
  const coverUriMap = syncedCoverUriCacheRef.current;
  // The manifest is complete here, so files for covers it no longer lists are orphans.
  const coverStore = syncedCoverStoreRef.current;
  void coverStore.pruneLibrary(activeIdentity.libraryId, allCovers.map((c) => c.coverKey), ownsCatalogSync).catch(() => {});
  void syncedCatalogStoreRef.current.retainedLibraryIds().then((ids) => {
    if (ownsCatalogSync()) return coverStore.purgeLibrariesExcept(ids, ownsCatalogSync);
  }).catch(() => {});

  const pending = await syncedCatalogStoreRef.current.pendingCovers(activeIdentity.libraryId, activeIdentity.revision);
  if (!ownsCatalogSync() || catalogCoversByAlbumRef.current !== coverMap || syncedCoverUriCacheRef.current !== coverUriMap) return;
  const ownsCoverDownloads = () => ownsCatalogSync() &&
    catalogCoversByAlbumRef.current === coverMap && syncedCoverUriCacheRef.current === coverUriMap;
  await storePendingCovers(deps,
    api, activeIdentity, allCovers, pending, coverStore, coverUriMap, ownsCoverDownloads,
    (request) => catalogNetwork(deps, api, attempt, generation, true, request),
  );
};

export function createCatalogSync(deps: CatalogSyncDependencies) {
  return {
    startCatalogSync: startCatalogSync.bind(undefined, deps),
  };
}
