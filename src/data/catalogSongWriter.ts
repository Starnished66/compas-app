import { ensureCatalogState, readCatalogState } from './catalogDatabase';
import type { SqlDatabase } from './catalogDatabase';
import { writeSongRows } from './catalogPageWriter';
import type { CatalogPage } from './types';

/** Libraries (players) whose catalogs stay on device, including the active one. */
const RETAINED_LIBRARIES = 3;

export async function beginCatalogStage(db: SqlDatabase, libraryId: string, revision: string, total: number): Promise<number> {
  if (!libraryId.trim() || !revision.trim() || total < 0) {
    throw new Error('Invalid arguments to beginCatalogStage');
  }

  // Counts are dropped after commit so a concurrent page read cannot re-cache pre-commit rows.
  return db.transaction(async (tx) => {
    await ensureCatalogState(tx, libraryId);
    const current = await readCatalogState(tx, libraryId);

    if (current.stageRevision === revision && current.stageTotal === total) {
      return current.stageNextOffset;
    }

    await tx.run(
      'DELETE FROM catalog_songs WHERE library_id = ? AND revision != ? AND revision != ?',
      [libraryId, revision, current.activeRevision || '']
    );
    await tx.run('DELETE FROM catalog_songs WHERE library_id = ? AND revision = ?', [libraryId, revision]);
    await tx.run('DELETE FROM catalog_song_artists WHERE library_id = ? AND revision = ?', [libraryId, revision]);

    await tx.run(
      `UPDATE catalog_state SET
        stage_revision = ?,
        stage_total = ?,
        stage_next_offset = 0
       WHERE library_id = ?`,
      [revision, total, libraryId]
    );
    return 0;
  });
}

export async function writeCatalogPage(db: SqlDatabase, page: CatalogPage): Promise<void> {
  await db.transaction(async (tx) => {
    await ensureCatalogState(tx, page.libraryId);
    const state = await readCatalogState(tx, page.libraryId);
    if (state.stageRevision !== page.revision || state.stageTotal !== page.total) {
      throw new Error('Catalog staging revision changed');
    }
    if (page.offset > state.stageNextOffset && page.offset !== 0) {
      throw new Error('Catalog page skipped a checkpoint');
    }

    await writeSongRows(tx, page);

    const next = Math.max(state.stageNextOffset, page.nextOffset);
    await tx.run('UPDATE catalog_state SET stage_next_offset = ? WHERE library_id = ?', [next, page.libraryId]);
  });
}

export async function publishCatalog(db: SqlDatabase, libraryId: string, revision: string, total: number): Promise<string[]> {
  return db.transaction(async (tx) => {
    const state = await readCatalogState(tx, libraryId);
    if (state.stageRevision !== revision || state.stageTotal !== total || state.stageNextOffset < total) {
      throw new Error('Catalog pages are incomplete');
    }
    const countRow = await tx.queryFirst(
      'SELECT COUNT(*) as count FROM catalog_songs WHERE library_id = ? AND revision = ?',
      [libraryId, revision]
    );
    const stagedCount = countRow ? Number(countRow.count) : 0;
    if (stagedCount !== total) {
      throw new Error('Catalog row count does not match its total');
    }

    await tx.run(
      `UPDATE catalog_state SET
        active_revision = ?,
        active_total = ?,
        stage_revision = NULL,
        stage_total = 0,
        stage_next_offset = 0,
        covers_revision = NULL,
        covers_total = 0,
        covers_next_offset = 0,
        covers_complete = 0,
        published_at = ?
       WHERE library_id = ?`,
      [revision, total, Date.now(), libraryId]
    );

    await tx.run('DELETE FROM catalog_songs WHERE library_id = ? AND revision != ?', [libraryId, revision]);
    await tx.run('DELETE FROM catalog_song_artists WHERE library_id = ? AND revision != ?', [libraryId, revision]);
    await tx.run('DELETE FROM catalog_covers WHERE library_id = ?', [libraryId]);

    // Keep only the few most recently published players; older ones would otherwise stay forever.
    const others = await tx.query<{ library_id: string }>(
      'SELECT library_id FROM catalog_state WHERE library_id != ? ORDER BY published_at DESC, library_id',
      [libraryId]
    );
    const dropped = others.slice(RETAINED_LIBRARIES - 1).map((row) => String(row.library_id));
    for (const id of dropped) {
      for (const table of ['catalog_songs', 'catalog_song_artists', 'catalog_covers', 'catalog_state']) {
        await tx.run(`DELETE FROM ${table} WHERE library_id = ?`, [id]);
      }
    }
    return dropped;
  });
}
