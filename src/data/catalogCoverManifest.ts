import { ensureCatalogState, readCatalogState } from './catalogDatabase';
import type { SqlDatabase } from './catalogDatabase';
import { writeCoverRows } from './catalogPageWriter';
import type { CatalogCoversPage } from './types';

export interface CatalogCoverProgress {
  total: number;
  nextOffset: number;
  manifestComplete: boolean;
}

export interface StoredCatalogCover {
  albumKey: string;
  representativeId: number;
  coverKey: string;
  available: boolean | null;
  downloadState: number;
}

export const COVER_PENDING = 0;
export const COVER_STORED = 1;
export const COVER_MISSING = 2;
export const COVER_PERMANENT_FAILURE = 3;
const PENDING_COVERS_WHERE = 'library_id = ? AND revision = ? AND (available IS NULL OR available != 0) AND download_state = ?';

export async function beginCovers(
  db: SqlDatabase,
  libraryId: string,
  revision: string,
  total: number,
  refreshManifest: boolean = false
): Promise<CatalogCoverProgress> {
  if (total < 0) throw new Error('Total must be non-negative');

  return await db.transaction(async (tx) => {
    await ensureCatalogState(tx, libraryId);
    const state = await readCatalogState(tx, libraryId);
    if (state.activeRevision !== revision) {
      throw new Error('Cannot attach covers to an inactive catalog');
    }

    if (state.coversRevision !== revision || state.coversTotal !== total) {
      await tx.run('DELETE FROM catalog_covers WHERE library_id = ?', [libraryId]);
      await tx.run(
        `UPDATE catalog_state SET
          covers_revision = ?,
          covers_total = ?,
          covers_next_offset = 0,
          covers_complete = 0
         WHERE library_id = ?`,
        [revision, total, libraryId]
      );
    } else if (refreshManifest) {
      await tx.run(
        'UPDATE catalog_covers SET manifest_seen = 0 WHERE library_id = ? AND revision = ?',
        [libraryId, revision]
      );
      await tx.run(
        `UPDATE catalog_state SET
          covers_next_offset = 0,
          covers_complete = 0
         WHERE library_id = ?`,
        [libraryId]
      );
    }

    const updated = await readCatalogState(tx, libraryId);
    return {
      total: updated.coversTotal,
      nextOffset: updated.coversNextOffset,
      manifestComplete: updated.coversComplete,
    };
  });
}

export async function writeCoverPage(db: SqlDatabase, page: CatalogCoversPage): Promise<void> {
  await db.transaction(async (tx) => {
    const state = await readCatalogState(tx, page.libraryId);
    if (
      state.activeRevision !== page.revision ||
      state.coversRevision !== page.revision ||
      state.coversTotal !== page.total
    ) {
      throw new Error('Catalog cover staging revision changed');
    }
    if (page.offset > state.coversNextOffset && page.offset !== 0) {
      throw new Error('Catalog cover page skipped a checkpoint');
    }

    await writeCoverRows(tx, page, COVER_PENDING, COVER_MISSING);

    const next = Math.max(state.coversNextOffset, page.nextOffset);
    await tx.run('UPDATE catalog_state SET covers_next_offset = ? WHERE library_id = ?', [next, page.libraryId]);
  });
}

export async function publishCovers(db: SqlDatabase, libraryId: string, revision: string, total: number): Promise<void> {
  await db.transaction(async (tx) => {
    const state = await readCatalogState(tx, libraryId);
    if (
      state.activeRevision !== revision ||
      state.coversRevision !== revision ||
      state.coversTotal !== total ||
      state.coversNextOffset < total
    ) {
      throw new Error('Catalog cover pages are incomplete');
    }
    const countRow = await tx.queryFirst(
      'SELECT COUNT(*) as count FROM catalog_covers WHERE library_id = ? AND revision = ? AND manifest_seen = 1',
      [libraryId, revision]
    );
    const manifestCount = countRow ? Number(countRow.count) : 0;
    if (manifestCount !== total) {
      throw new Error('Catalog cover count does not match its total');
    }

    await tx.run(
      'DELETE FROM catalog_covers WHERE library_id = ? AND revision = ? AND manifest_seen = 0',
      [libraryId, revision]
    );
    await tx.run(
      'UPDATE catalog_covers SET manifest_seen = 1 WHERE library_id = ? AND revision = ?',
      [libraryId, revision]
    );
    await tx.run('UPDATE catalog_state SET covers_complete = 1 WHERE library_id = ?', [libraryId]);
  });
}

export async function coverProgress(db: SqlDatabase, libraryId: string, revision: string): Promise<CatalogCoverProgress | null> {
  const row = await db.queryFirst(
    `SELECT covers_total, covers_next_offset, covers_complete
     FROM catalog_state WHERE library_id = ? AND active_revision = ? AND covers_revision = ?`,
    [libraryId, revision, revision]
  );
  if (!row) return null;
  return {
    total: Number(row.covers_total || 0),
    nextOffset: Number(row.covers_next_offset || 0),
    manifestComplete: Boolean(row.covers_complete),
  };
}

export async function catalogCovers(db: SqlDatabase, libraryId: string, revision: string): Promise<StoredCatalogCover[]> {
  const rows = await db.query(
    `SELECT album_key, representative_id, cover_key, available, download_state
     FROM catalog_covers WHERE library_id = ? AND revision = ? ORDER BY album_key`,
    [libraryId, revision]
  );
  return rows.map(storedCover);
}

export async function coverForAlbum(db: SqlDatabase, libraryId: string, revision: string, albumKey: string): Promise<StoredCatalogCover | null> {
  const r = await db.queryFirst(
    `SELECT album_key, representative_id, cover_key, available, download_state
     FROM catalog_covers WHERE library_id = ? AND revision = ? AND album_key = ?`,
    [libraryId, revision, albumKey]
  );
  return r ? storedCover(r) : null;
}

export async function markCoverState(db: SqlDatabase, libraryId: string, revision: string, albumKey: string, state: number): Promise<void> {
  await db.run(
    'UPDATE catalog_covers SET download_state = ? WHERE library_id = ? AND revision = ? AND album_key = ?',
    [state, libraryId, revision, albumKey]
  );
}

export async function hasPendingCovers(db: SqlDatabase, libraryId: string, revision: string): Promise<boolean> {
  const row = await db.queryFirst(
    `SELECT 1 FROM catalog_covers WHERE ${PENDING_COVERS_WHERE} LIMIT 1`,
    [libraryId, revision, COVER_PENDING]
  );
  return row != null;
}

export async function pendingCovers(db: SqlDatabase, libraryId: string, revision: string): Promise<StoredCatalogCover[]> {
  const rows = await db.query(
    `SELECT album_key, representative_id, cover_key, available, download_state
     FROM catalog_covers
     WHERE ${PENDING_COVERS_WHERE}
     ORDER BY album_key`,
    [libraryId, revision, COVER_PENDING]
  );
  return rows.map(storedCover);
}

export async function completedCoverCount(db: SqlDatabase, libraryId: string, revision: string): Promise<number> {
  const row = await db.queryFirst(
    `SELECT COUNT(*) as count FROM catalog_covers
     WHERE library_id = ? AND revision = ? AND download_state != ?`,
    [libraryId, revision, COVER_PENDING]
  );
  return row ? Number(row.count || 0) : 0;
}

function storedCover(r: any): StoredCatalogCover {
  return {
    albumKey: String(r.album_key),
    representativeId: Number(r.representative_id),
    coverKey: String(r.cover_key),
    available: r.available != null ? r.available !== 0 : null,
    downloadState: Number(r.download_state),
  };
}
