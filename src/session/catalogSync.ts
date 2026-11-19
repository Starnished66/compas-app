import { LocalCatalogOpenError } from '../data/catalogDatabase';
import type { CatalogCoverProgress, CatalogIdentity, StoredCatalogCover, SyncedCatalogStore } from '../data/SyncedCatalogStore';
import type { RemoteApi } from '../data/RemoteApi';
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
