import { LocalCatalogOpenError, openCatalogDatabase } from './catalogDatabase';
import type { SqlDatabase } from './catalogDatabase';
import { migrateCatalog } from './catalogMigrations';
import { CatalogBrowseQueries } from './catalogBrowseQueries';
import * as covers from './catalogCoverManifest';
import * as songs from './catalogSongWriter';
import type { CatalogCoverProgress, StoredCatalogCover } from './catalogCoverManifest';
import type { CatalogCoversPage, CatalogPage } from './types';

export type { SqlDatabase } from './catalogDatabase';
export { CatalogGroupKind } from './catalogBrowseQueries';
export type { CatalogGroup, CatalogPageSlice } from './catalogBrowseQueries';
export type { CatalogCoverProgress, StoredCatalogCover } from './catalogCoverManifest';

export interface CatalogIdentity {
  libraryId: string;
  revision: string;
  total: number;
}

export class SyncedCatalogStore {
  static readonly COVER_PENDING = covers.COVER_PENDING;
  static readonly COVER_STORED = covers.COVER_STORED;
  static readonly COVER_MISSING = covers.COVER_MISSING;
  static readonly COVER_PERMANENT_FAILURE = covers.COVER_PERMANENT_FAILURE;

  private opening: Promise<SqlDatabase> | null = null;
  private readonly browse = new CatalogBrowseQueries(() => this.database());

  constructor(private readonly injectedDb?: SqlDatabase) {}

  async init(): Promise<void> {
    await this.database();
  }

  private database(): Promise<SqlDatabase> {
    if (!this.opening) {
      this.opening = Promise.resolve()
        .then(() => this.injectedDb ?? openCatalogDatabase())
        .then(async (db) => {
          try {
            await migrateCatalog(db);
            return db;
          } catch (error) {
            await db.close?.().catch(() => {});
            throw error;
          }
        })
        .catch((error) => {
          this.opening = null;
          throw new LocalCatalogOpenError(error);
        });
    }
    return this.opening;
  }

  async activeIdentity(libraryId: string): Promise<CatalogIdentity | null> {
    const db = await this.database();
    const row = await db.queryFirst(
      'SELECT active_revision, active_total FROM catalog_state WHERE library_id = ?',
      [libraryId]
    );
    if (!row || !row.active_revision) return null;
    return {
      libraryId,
      revision: row.active_revision,
      total: Number(row.active_total || 0),
    };
  }

  async beginCatalogStage(libraryId: string, revision: string, total: number): Promise<number> {
    const restarted = await songs.beginCatalogStage(await this.database(), libraryId, revision, total);
    if (restarted === 0) this.browse.invalidateSongCounts(libraryId, revision);
    return restarted;
  }

  async writeCatalogPage(page: CatalogPage): Promise<void> {
    await songs.writeCatalogPage(await this.database(), page);
    this.browse.invalidateSongCounts(page.libraryId, page.revision);
  }

  async publishCatalog(libraryId: string, revision: string, total: number): Promise<void> {
    const evicted = await songs.publishCatalog(await this.database(), libraryId, revision, total);
    for (const id of [libraryId, ...evicted]) this.browse.invalidateSongCounts(id);
  }

  /** Library ids that still have catalog state; synced cover directories for any other library can be purged. */
  async retainedLibraryIds(): Promise<string[]> {
    const db = await this.database();
    const rows = await db.query<{ library_id: string }>('SELECT library_id FROM catalog_state');
    return rows.map((r) => String(r.library_id));
  }

  activeSongCount(...args: Parameters<CatalogBrowseQueries['activeSongCount']>) {
    return this.browse.activeSongCount(...args);
  }

  async albumKeyForSong(libraryId: string, revision: string, songId: number): Promise<string | null> {
    const keys = await this.albumKeysForSongs(libraryId, revision, [songId]);
    return keys.get(songId) ?? null;
  }

  albumKeysForSongs(...args: Parameters<CatalogBrowseQueries['albumKeysForSongs']>) {
    return this.browse.albumKeysForSongs(...args);
  }

  songPage(...args: Parameters<CatalogBrowseQueries['songPage']>) {
    return this.browse.songPage(...args);
  }

  groups(...args: Parameters<CatalogBrowseQueries['groups']>) {
    return this.browse.groups(...args);
  }

  findAlbumKey(...args: Parameters<CatalogBrowseQueries['findAlbumKey']>) {
    return this.browse.findAlbumKey(...args);
  }

  async beginCovers(
    libraryId: string,
    revision: string,
    total: number,
    refreshManifest: boolean = false
  ): Promise<CatalogCoverProgress> {
    return covers.beginCovers(await this.database(), libraryId, revision, total, refreshManifest);
  }

  async writeCoverPage(page: CatalogCoversPage): Promise<void> {
    return covers.writeCoverPage(await this.database(), page);
  }

  async publishCovers(libraryId: string, revision: string, total: number): Promise<void> {
    return covers.publishCovers(await this.database(), libraryId, revision, total);
  }

  async coverProgress(libraryId: string, revision: string): Promise<CatalogCoverProgress | null> {
    return covers.coverProgress(await this.database(), libraryId, revision);
  }

  async catalogCovers(libraryId: string, revision: string): Promise<StoredCatalogCover[]> {
    return covers.catalogCovers(await this.database(), libraryId, revision);
  }

  async coverForAlbum(libraryId: string, revision: string, albumKey: string): Promise<StoredCatalogCover | null> {
    return covers.coverForAlbum(await this.database(), libraryId, revision, albumKey);
  }

  async markCoverState(libraryId: string, revision: string, albumKey: string, state: number): Promise<void> {
    return covers.markCoverState(await this.database(), libraryId, revision, albumKey, state);
  }

  async hasPendingCovers(libraryId: string, revision: string): Promise<boolean> {
    return covers.hasPendingCovers(await this.database(), libraryId, revision);
  }

  async pendingCovers(libraryId: string, revision: string): Promise<StoredCatalogCover[]> {
    return covers.pendingCovers(await this.database(), libraryId, revision);
  }

  async completedCoverCount(libraryId: string, revision: string): Promise<number> {
    return covers.completedCoverCount(await this.database(), libraryId, revision);
  }
}

// The live store keeps its connections and count cache for the app runtime.
export const liveCatalogStore = new SyncedCatalogStore();
