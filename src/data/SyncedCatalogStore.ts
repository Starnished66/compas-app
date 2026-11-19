import { LocalCatalogOpenError, openCatalogDatabase } from './catalogDatabase';
import type { SqlConnection, SqlDatabase } from './catalogDatabase';
import { migrateCatalog } from './catalogMigrations';
import { writeCoverRows, writeSongRows } from './catalogPageWriter';
import type { CatalogCoversPage, CatalogPage, CatalogSong } from './types';

export type { SqlDatabase } from './catalogDatabase';

export interface CatalogIdentity {
  libraryId: string;
  revision: string;
  total: number;
}

export interface CatalogPageSlice {
  total: number;
  songs: CatalogSong[];
}

export interface CatalogGroup {
  name: string;
  count: number;
  index: number;
  albumArtist: string;
  albumKey?: string | null;
}

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

export enum CatalogGroupKind {
  Artist = 'Artist',
  AlbumArtist = 'AlbumArtist',
  Album = 'Album',
  Genre = 'Genre',
}

/** Libraries (players) whose catalogs stay on device, including the active one. */
const RETAINED_LIBRARIES = 3;
const SONG_COUNT_CACHE_LIMIT = 64;
const PENDING_COVERS_WHERE = 'library_id = ? AND revision = ? AND (available IS NULL OR available != 0) AND download_state = ?';

export class SyncedCatalogStore {
  static readonly COVER_PENDING = 0;
  static readonly COVER_STORED = 1;
  static readonly COVER_MISSING = 2;
  static readonly COVER_PERMANENT_FAILURE = 3;

  private opening: Promise<SqlDatabase> | null = null;
  // Filtered song totals per library/revision/filter; a published revision's rows never change.
  private songCounts = new Map<string, number>();
  private songCountGeneration = 0;

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

  async activeSongCount(libraryId: string, revision: string): Promise<number> {
    const db = await this.database();
    const row = await db.queryFirst(
      'SELECT COUNT(*) as count FROM catalog_songs WHERE library_id = ? AND revision = ?',
      [libraryId, revision]
    );
    return row ? Number(row.count || 0) : 0;
  }

  async beginCatalogStage(libraryId: string, revision: string, total: number): Promise<number> {
    const db = await this.database();
    if (!libraryId.trim() || !revision.trim() || total < 0) {
      throw new Error('Invalid arguments to beginCatalogStage');
    }

    // Counts are dropped after commit so a concurrent page read cannot re-cache pre-commit rows.
    const restarted = await db.transaction(async (tx) => {
      await this.ensureState(tx, libraryId);
      const current = await this.stateRow(tx, libraryId);

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
    if (restarted === 0) this.invalidateSongCounts(libraryId, revision);
    return restarted;
  }

  async writeCatalogPage(page: CatalogPage): Promise<void> {
    const db = await this.database();
    await db.transaction(async (tx) => {
      await this.ensureState(tx, page.libraryId);
      const state = await this.stateRow(tx, page.libraryId);
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
    this.invalidateSongCounts(page.libraryId, page.revision);
  }

  async publishCatalog(libraryId: string, revision: string, total: number): Promise<void> {
    const db = await this.database();
    const evicted = await db.transaction(async (tx) => {
      const state = await this.stateRow(tx, libraryId);
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
    for (const id of [libraryId, ...evicted]) this.invalidateSongCounts(id);
  }

  /** Library ids that still have catalog state; synced cover directories for any other library can be purged. */
  async retainedLibraryIds(): Promise<string[]> {
    const db = await this.database();
    const rows = await db.query<{ library_id: string }>('SELECT library_id FROM catalog_state');
    return rows.map((r) => String(r.library_id));
  }

  async beginCovers(
    libraryId: string,
    revision: string,
    total: number,
    refreshManifest: boolean = false
  ): Promise<CatalogCoverProgress> {
    const db = await this.database();
    if (total < 0) throw new Error('Total must be non-negative');

    return await db.transaction(async (tx) => {
      await this.ensureState(tx, libraryId);
      const state = await this.stateRow(tx, libraryId);
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

      const updated = await this.stateRow(tx, libraryId);
      return {
        total: updated.coversTotal,
        nextOffset: updated.coversNextOffset,
        manifestComplete: updated.coversComplete,
      };
    });
  }

  async writeCoverPage(page: CatalogCoversPage): Promise<void> {
    const db = await this.database();
    await db.transaction(async (tx) => {
      const state = await this.stateRow(tx, page.libraryId);
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

      await writeCoverRows(tx, page, SyncedCatalogStore.COVER_PENDING, SyncedCatalogStore.COVER_MISSING);

      const next = Math.max(state.coversNextOffset, page.nextOffset);
      await tx.run('UPDATE catalog_state SET covers_next_offset = ? WHERE library_id = ?', [next, page.libraryId]);
    });
  }

  async publishCovers(libraryId: string, revision: string, total: number): Promise<void> {
    const db = await this.database();
    await db.transaction(async (tx) => {
      const state = await this.stateRow(tx, libraryId);
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

  async coverProgress(libraryId: string, revision: string): Promise<CatalogCoverProgress | null> {
    const db = await this.database();
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

  async catalogCovers(libraryId: string, revision: string): Promise<StoredCatalogCover[]> {
    const db = await this.database();
    const rows = await db.query(
      `SELECT album_key, representative_id, cover_key, available, download_state
       FROM catalog_covers WHERE library_id = ? AND revision = ? ORDER BY album_key`,
      [libraryId, revision]
    );
    return rows.map((r: any) => ({
      albumKey: String(r.album_key),
      representativeId: Number(r.representative_id),
      coverKey: String(r.cover_key),
      available: r.available != null ? r.available !== 0 : null,
      downloadState: Number(r.download_state),
    }));
  }

  async coverForAlbum(libraryId: string, revision: string, albumKey: string): Promise<StoredCatalogCover | null> {
    const db = await this.database();
    const r = await db.queryFirst(
      `SELECT album_key, representative_id, cover_key, available, download_state
       FROM catalog_covers WHERE library_id = ? AND revision = ? AND album_key = ?`,
      [libraryId, revision, albumKey]
    );
    if (!r) return null;
    return {
      albumKey: String(r.album_key),
      representativeId: Number(r.representative_id),
      coverKey: String(r.cover_key),
      available: r.available != null ? r.available !== 0 : null,
      downloadState: Number(r.download_state),
    };
  }

  async albumKeyForSong(libraryId: string, revision: string, songId: number): Promise<string | null> {
    const keys = await this.albumKeysForSongs(libraryId, revision, [songId]);
    return keys.get(songId) ?? null;
  }

  async albumKeysForSongs(libraryId: string, revision: string, songIds: number[]): Promise<Map<number, string>> {
    if (!songIds.length) return new Map();
    const db = await this.database();
    const rows = await db.query<{ song_id: number; album_key: string }>(
      `SELECT id AS song_id, album_key FROM catalog_songs
       WHERE library_id = ? AND revision = ? AND id IN (${songIds.map(() => '?').join(', ')})
       AND album_key IS NOT NULL`,
      [libraryId, revision, ...songIds]
    );
    return new Map(rows.map((row) => [row.song_id, row.album_key]));
  }

  async markCoverState(libraryId: string, revision: string, albumKey: string, state: number): Promise<void> {
    const db = await this.database();
    await db.run(
      'UPDATE catalog_covers SET download_state = ? WHERE library_id = ? AND revision = ? AND album_key = ?',
      [state, libraryId, revision, albumKey]
    );
  }

  async hasPendingCovers(libraryId: string, revision: string): Promise<boolean> {
    const db = await this.database();
    const row = await db.queryFirst(
      `SELECT 1 FROM catalog_covers WHERE ${PENDING_COVERS_WHERE} LIMIT 1`,
      [libraryId, revision, SyncedCatalogStore.COVER_PENDING]
    );
    return row != null;
  }

  async pendingCovers(libraryId: string, revision: string): Promise<StoredCatalogCover[]> {
    const db = await this.database();
    const rows = await db.query(
      `SELECT album_key, representative_id, cover_key, available, download_state
       FROM catalog_covers
       WHERE ${PENDING_COVERS_WHERE}
       ORDER BY album_key`,
      [libraryId, revision, SyncedCatalogStore.COVER_PENDING]
    );
    return rows.map((r: any) => ({
      albumKey: String(r.album_key),
      representativeId: Number(r.representative_id),
      coverKey: String(r.cover_key),
      available: r.available != null ? r.available !== 0 : null,
      downloadState: Number(r.download_state),
    }));
  }

  async completedCoverCount(libraryId: string, revision: string): Promise<number> {
    const db = await this.database();
    const row = await db.queryFirst(
      `SELECT COUNT(*) as count FROM catalog_covers
       WHERE library_id = ? AND revision = ? AND download_state != ?`,
      [libraryId, revision, SyncedCatalogStore.COVER_PENDING]
    );
    return row ? Number(row.count || 0) : 0;
  }

  async songPage(
    libraryId: string,
    revision: string,
    offset: number,
    limit: number,
    query?: string | null,
    artist?: string | null,
    albumArtist?: string | null,
    album?: string | null,
    genre?: string | null,
    albumKey?: string | null,
    splitGenres = false,
  ): Promise<CatalogPageSlice> {
    const db = await this.database();
    const [where, args] = this.songWhere(libraryId, revision, query, artist, albumArtist, album, genre, albumKey, splitGenres);

    const order =
      albumKey != null || album != null
        ? `CASE WHEN disc_number IS NULL THEN 1 ELSE 0 END, disc_number,
           CASE WHEN track_number IS NULL THEN 1 ELSE 0 END, track_number, catalog_rank`
        : 'catalog_rank';

    // Paging re-reads the same filter repeatedly; count it once per revision instead of on every page.
    const countKey = `${libraryId}\u0000${revision}\u0000${JSON.stringify([where, args.slice(2)])}`;
    const cachedTotal = this.songCounts.get(countKey);
    const generation = this.songCountGeneration;
    const [countRow, rows] = await Promise.all([
      cachedTotal != null
        ? null
        : db.queryFirst(`SELECT COUNT(*) as count FROM catalog_songs WHERE ${where}`, args),
      db.query(
        `SELECT id, title, artist, album, album_artist, genre, track_number, disc_number, album_key
         FROM catalog_songs WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`,
        [...args, limit, offset]
      ),
    ]);
    let total = cachedTotal ?? 0;
    if (cachedTotal == null) {
      total = countRow ? Number(countRow.count || 0) : 0;
      if (generation === this.songCountGeneration) {
        if (this.songCounts.size >= SONG_COUNT_CACHE_LIMIT) {
          this.songCounts.delete(this.songCounts.keys().next().value as string);
        }
        this.songCounts.set(countKey, total);
      }
    }

    const songs: CatalogSong[] = rows.map((r: any) => ({
      id: Number(r.id),
      title: String(r.title || ''),
      artist: String(r.artist || ''),
      album: String(r.album || ''),
      albumArtist: String(r.album_artist || ''),
      genre: String(r.genre || ''),
      trackNumber: r.track_number != null ? Number(r.track_number) : null,
      discNumber: r.disc_number != null ? Number(r.disc_number) : null,
      albumKey: r.album_key ? String(r.album_key) : null,
      artists: [],
    }));

    return { total, songs };
  }

  async groups(
    libraryId: string,
    revision: string,
    kind: CatalogGroupKind,
    query?: string | null,
    artist?: string | null,
    albumArtist?: string | null,
    splitGenres = false,
  ): Promise<CatalogGroup[]> {
    const db = await this.database();

    if (kind === CatalogGroupKind.Artist) {
      const filter = [
        'catalog_song_artists.library_id = ?',
        'catalog_song_artists.revision = ?',
        "catalog_song_artists.artist != ''",
      ];
      const args: any[] = [libraryId, revision];

      if (albumArtist) {
        filter.push(
          `EXISTS (SELECT 1 FROM catalog_songs WHERE
            catalog_songs.library_id = catalog_song_artists.library_id AND
            catalog_songs.revision = catalog_song_artists.revision AND
            catalog_songs.id = catalog_song_artists.song_id AND
            catalog_songs.album_artist = ? COLLATE NOCASE)`
        );
        args.push(albumArtist);
      }
      if (query && query.trim()) {
        filter.push('instr(lower(catalog_song_artists.artist), lower(?)) > 0');
        args.push(query.trim());
      }

      const sql = `
        SELECT MIN(catalog_song_artists.artist) as name,
               COUNT(DISTINCT catalog_song_artists.song_id) as count,
               MIN(catalog_song_artists.song_id) as idx
        FROM catalog_song_artists
        WHERE ${filter.join(' AND ')}
        GROUP BY catalog_song_artists.artist COLLATE NOCASE
        ORDER BY MIN(catalog_song_artists.artist) COLLATE NOCASE
      `;

      const rows = await db.query(sql, args);
      return rows.map((r: any) => ({
        name: String(r.name || ''),
        count: Number(r.count || 0),
        index: Number(r.idx || 0),
        albumArtist: '',
        albumKey: null,
      }));
    }

    const filter = ['catalog_songs.library_id = ?', 'catalog_songs.revision = ?'];
    const args: any[] = [libraryId, revision];

    if (artist) {
      filter.push(
        `catalog_songs.id IN (SELECT song_id FROM catalog_song_artists WHERE
          library_id = ? AND revision = ? AND artist = ? COLLATE NOCASE)`
      );
      args.push(libraryId, revision, artist);
    }
    if (albumArtist) {
      filter.push('catalog_songs.album_artist = ? COLLATE NOCASE');
      args.push(albumArtist);
    }

    const useGenreRows = kind === CatalogGroupKind.Genre && splitGenres;
    const genreColumn = useGenreRows ? 'catalog_song_genres.genre' : 'catalog_songs.genre';
    const genreJoin = useGenreRows ? `JOIN catalog_song_genres ON
      catalog_song_genres.library_id = catalog_songs.library_id AND
      catalog_song_genres.revision = catalog_songs.revision AND
      catalog_song_genres.song_id = catalog_songs.id` : '';
    const [nameCol, groupCol] =
      kind === CatalogGroupKind.AlbumArtist
        ? ['catalog_songs.album_artist', 'catalog_songs.album_artist']
        : kind === CatalogGroupKind.Genre
        ? [genreColumn, genreColumn]
        : ['catalog_songs.album', 'catalog_songs.album_key'];

    if (kind !== CatalogGroupKind.Album) {
      filter.push(`${groupCol} != ''`);
    } else {
      filter.push('catalog_songs.album_key IS NOT NULL');
    }

    if (query && query.trim()) {
      filter.push(`instr(lower(${nameCol}), lower(?)) > 0`);
      args.push(query.trim());
    }

    const sql =
      kind === CatalogGroupKind.Album
        ? `SELECT MAX(catalog_songs.album) as name,
                  COUNT(*) as count,
                  MIN(catalog_songs.id) as idx,
                  MAX(catalog_songs.album_artist) as album_artist,
                  catalog_songs.album_key as album_key
           FROM catalog_songs
           WHERE ${filter.join(' AND ')}
           GROUP BY catalog_songs.album_key
           ORDER BY MAX(catalog_songs.album) COLLATE NOCASE`
        : `SELECT MIN(${nameCol}) as name,
                  COUNT(DISTINCT catalog_songs.id) as count,
                  MIN(catalog_songs.id) as idx,
                  '' as album_artist,
                  NULL as album_key
           FROM catalog_songs ${genreJoin}
           WHERE ${filter.join(' AND ')}
           GROUP BY ${groupCol} COLLATE NOCASE
           ORDER BY MIN(${nameCol}) COLLATE NOCASE`;

    const rows = await db.query(sql, args);
    return rows.map((r: any) => ({
      name: String(r.name || ''),
      count: Number(r.count || 0),
      index: Number(r.idx || 0),
      albumArtist: String(r.album_artist || ''),
      albumKey: r.album_key ? String(r.album_key) : null,
    }));
  }

  async findAlbumKey(
    libraryId: string,
    revision: string,
    title: string,
    artist: string,
    album: string
  ): Promise<string | null> {
    const db = await this.database();
    const row = await db.queryFirst(
      `SELECT album_key FROM catalog_songs
       WHERE library_id = ? AND revision = ? AND
             title = ? COLLATE NOCASE AND artist = ? COLLATE NOCASE AND album = ? COLLATE NOCASE AND
             album_key IS NOT NULL
       ORDER BY catalog_rank LIMIT 1`,
      [libraryId, revision, title, artist, album]
    );
    return row && row.album_key ? String(row.album_key) : null;
  }

  private songWhere(
    libraryId: string,
    revision: string,
    query?: string | null,
    artist?: string | null,
    albumArtist?: string | null,
    album?: string | null,
    genre?: string | null,
    albumKey?: string | null,
    splitGenres = false,
  ): [string, any[]] {
    const clauses = ['library_id = ?', 'revision = ?'];
    const args: any[] = [libraryId, revision];

    if (artist) {
      // An IN list lets the artist name index drive the lookup instead of probing every song.
      clauses.push(
        `id IN (SELECT song_id FROM catalog_song_artists WHERE
          library_id = ? AND revision = ? AND artist = ? COLLATE NOCASE)`
      );
      args.push(libraryId, revision, artist);
    }
    if (albumArtist) {
      clauses.push('album_artist = ? COLLATE NOCASE');
      args.push(albumArtist);
    }
    if (albumKey == null && album) {
      clauses.push('album = ? COLLATE NOCASE');
      args.push(album);
    }
    if (genre) {
      if (splitGenres) {
        clauses.push(`id IN (SELECT song_id FROM catalog_song_genres WHERE
          library_id = ? AND revision = ? AND genre = ? COLLATE NOCASE)`);
        args.push(libraryId, revision);
      } else {
        clauses.push('genre = ? COLLATE NOCASE');
      }
      args.push(genre);
    }
    if (albumKey != null) {
      clauses.push('album_key = ?');
      args.push(albumKey);
    }
    if (query && query.trim()) {
      clauses.push(
        '(instr(lower(title), lower(?)) > 0 OR instr(lower(artist), lower(?)) > 0 OR instr(lower(album), lower(?)) > 0 OR instr(lower(album_artist), lower(?)) > 0 OR instr(lower(genre), lower(?)) > 0)'
      );
      for (let i = 0; i < 5; i++) {
        args.push(query.trim());
      }
    }

    return [clauses.join(' AND '), args];
  }

  private invalidateSongCounts(libraryId: string, revision?: string): void {
    this.songCountGeneration++;
    const prefix = revision != null ? `${libraryId}\u0000${revision}\u0000` : `${libraryId}\u0000`;
    for (const key of Array.from(this.songCounts.keys())) {
      if (key.startsWith(prefix)) this.songCounts.delete(key);
    }
  }

  private async ensureState(tx: SqlConnection, libraryId: string): Promise<void> {
    await tx.run('INSERT OR IGNORE INTO catalog_state (library_id) VALUES (?)', [libraryId]);
  }

  private async stateRow(tx: SqlConnection, libraryId: string): Promise<{
    activeRevision: string | null;
    activeTotal: number;
    stageRevision: string | null;
    stageTotal: number;
    stageNextOffset: number;
    coversRevision: string | null;
    coversTotal: number;
    coversNextOffset: number;
    coversComplete: boolean;
  }> {
    const row = await tx.queryFirst(
      `SELECT active_revision, active_total, stage_revision, stage_total, stage_next_offset,
              covers_revision, covers_total, covers_next_offset, covers_complete
       FROM catalog_state WHERE library_id = ?`,
      [libraryId]
    );
    if (!row) {
      throw new Error('Catalog state is missing');
    }
    return {
      activeRevision: row.active_revision || null,
      activeTotal: Number(row.active_total || 0),
      stageRevision: row.stage_revision || null,
      stageTotal: Number(row.stage_total || 0),
      stageNextOffset: Number(row.stage_next_offset || 0),
      coversRevision: row.covers_revision || null,
      coversTotal: Number(row.covers_total || 0),
      coversNextOffset: Number(row.covers_next_offset || 0),
      coversComplete: Boolean(row.covers_complete),
    };
  }
}

// The live store keeps its connections and count cache for the app runtime.
export const liveCatalogStore = new SyncedCatalogStore();
