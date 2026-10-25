import {
  CatalogCover,
  CatalogCoversPage,
  CatalogPage,
  CatalogSong,
} from './types';

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

export interface SqlDatabase {
  exec(sql: string): Promise<void> | void;
  run(sql: string, params?: any[]): Promise<{ changes?: number }> | { changes?: number };
  get<T = any>(sql: string, params?: any[]): Promise<T | null> | (T | null);
  all<T = any>(sql: string, params?: any[]): Promise<T[]> | T[];
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  queryFirst<T = any>(sql: string, params?: any[]): Promise<T | null>;
  transaction<T>(action: (tx: SqlDatabase) => Promise<T>): Promise<T>;
}

// Memory database implementation for testing without native sqlite binaries
export class MemorySqlDatabase implements SqlDatabase {
  private tables = new Map<string, any[]>();

  async exec(sql: string): Promise<void> {
    const stmts = sql.split(';').map((s) => s.trim()).filter(Boolean);
    for (const stmt of stmts) {
      if (stmt.startsWith('CREATE TABLE')) {
        const match = stmt.match(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?([a-zA-Z0-9_]+)/i);
        if (match && !this.tables.has(match[1])) {
          this.tables.set(match[1], []);
        }
      }
    }
  }

  async run(sql: string, params: any[] = []): Promise<{ changes: number }> {
    const trimmed = sql.trim();
    if (trimmed.startsWith('INSERT')) {
      const match = trimmed.match(/INSERT\s+(?:OR REPLACE\s+|OR IGNORE\s+)?INTO\s+([a-zA-Z0-9_]+)/i);
      if (match) {
        const tbl = this.tables.get(match[1]) || [];
        const colsMatch = trimmed.match(/\(([^)]+)\)\s+VALUES/i);
        if (colsMatch) {
          const cols = colsMatch[1].split(',').map((c) => c.trim());
          const row: any = {};
          cols.forEach((col, idx) => {
            row[col] = params[idx];
          });
          tbl.push(row);
          this.tables.set(match[1], tbl);
          return { changes: 1 };
        }
      }
    } else if (trimmed.startsWith('DELETE')) {
      const match = trimmed.match(/DELETE FROM\s+([a-zA-Z0-9_]+)/i);
      if (match) {
        const tbl = this.tables.get(match[1]) || [];
        // Basic clear or condition
        if (!trimmed.includes('WHERE')) {
          this.tables.set(match[1], []);
          return { changes: tbl.length };
        }
      }
    }
    return { changes: 0 };
  }

  async get<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const rows = await this.all<T>(sql, params);
    return rows.length > 0 ? rows[0] : null;
  }

  async all<T = any>(_sql: string, _params: any[] = []): Promise<T[]> {
    return [];
  }

  query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    return this.all<T>(sql, params);
  }

  queryFirst<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    return this.get<T>(sql, params);
  }

  async transaction<T>(action: (tx: SqlDatabase) => Promise<T>): Promise<T> {
    return action(this);
  }
}

// Ordered schema steps; index i upgrades user_version i to i + 1. Never edit a shipped step, append a new one.
const SCHEMA_MIGRATIONS: string[] = [
  // v1: original schema. Installs from before versioning already have it, so every statement is IF NOT EXISTS.
  `
    CREATE TABLE IF NOT EXISTS catalog_state (
      library_id TEXT PRIMARY KEY NOT NULL,
      active_revision TEXT,
      active_total INTEGER NOT NULL DEFAULT 0,
      stage_revision TEXT,
      stage_total INTEGER NOT NULL DEFAULT 0,
      stage_next_offset INTEGER NOT NULL DEFAULT 0,
      covers_revision TEXT,
      covers_total INTEGER NOT NULL DEFAULT 0,
      covers_next_offset INTEGER NOT NULL DEFAULT 0,
      covers_complete INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS catalog_songs (
      library_id TEXT NOT NULL,
      revision TEXT NOT NULL,
      id INTEGER NOT NULL,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      album TEXT NOT NULL,
      album_artist TEXT NOT NULL,
      genre TEXT NOT NULL,
      track_number INTEGER,
      disc_number INTEGER,
      catalog_rank INTEGER NOT NULL DEFAULT 0,
      album_key TEXT,
      PRIMARY KEY (library_id, revision, id)
    );
    CREATE INDEX IF NOT EXISTS catalog_songs_album ON catalog_songs(library_id, revision, album_key);
    CREATE INDEX IF NOT EXISTS catalog_songs_artist ON catalog_songs(library_id, revision, artist);
    CREATE INDEX IF NOT EXISTS catalog_songs_album_artist ON catalog_songs(library_id, revision, album_artist);
    CREATE INDEX IF NOT EXISTS catalog_songs_genre ON catalog_songs(library_id, revision, genre);
    CREATE INDEX IF NOT EXISTS catalog_songs_title ON catalog_songs(library_id, revision, title COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS catalog_songs_rank ON catalog_songs(library_id, revision, catalog_rank);
    CREATE TABLE IF NOT EXISTS catalog_song_artists (
      library_id TEXT NOT NULL,
      revision TEXT NOT NULL,
      song_id INTEGER NOT NULL,
      artist TEXT NOT NULL,
      PRIMARY KEY (library_id, revision, song_id, artist)
    );
    CREATE INDEX IF NOT EXISTS catalog_song_artists_name ON catalog_song_artists(library_id, revision, artist);
    CREATE TABLE IF NOT EXISTS catalog_covers (
      library_id TEXT NOT NULL,
      revision TEXT NOT NULL,
      album_key TEXT NOT NULL,
      representative_id INTEGER NOT NULL,
      cover_key TEXT NOT NULL,
      available INTEGER,
      manifest_seen INTEGER NOT NULL DEFAULT 1,
      download_state INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (library_id, revision, album_key)
    );
  `,
  // v2: filters compare with COLLATE NOCASE, which binary-collated indexes cannot serve.
  `
    DROP INDEX IF EXISTS catalog_songs_artist;
    DROP INDEX IF EXISTS catalog_songs_album_artist;
    DROP INDEX IF EXISTS catalog_songs_genre;
    DROP INDEX IF EXISTS catalog_song_artists_name;
    CREATE INDEX IF NOT EXISTS catalog_songs_album_artist_nocase ON catalog_songs(library_id, revision, album_artist COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS catalog_songs_genre_nocase ON catalog_songs(library_id, revision, genre COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS catalog_songs_album_name_nocase ON catalog_songs(library_id, revision, album COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS catalog_song_artists_name_nocase ON catalog_song_artists(library_id, revision, artist COLLATE NOCASE);
    ALTER TABLE catalog_state ADD COLUMN published_at INTEGER NOT NULL DEFAULT 0;
  `,
];

/** Libraries (players) whose catalogs stay on device, including the active one. */
const RETAINED_LIBRARIES = 3;
const SONG_COUNT_CACHE_LIMIT = 64;

export class SyncedCatalogStore {
  static readonly COVER_PENDING = 0;
  static readonly COVER_STORED = 1;
  static readonly COVER_MISSING = 2;
  static readonly COVER_PERMANENT_FAILURE = 3;

  private db: SqlDatabase;
  private initialized = false;
  private initializing: Promise<void> | null = null;
  // Filtered song totals per library/revision/filter; a published revision's rows never change.
  private songCounts = new Map<string, number>();
  private songCountGeneration = 0;

  constructor(db?: SqlDatabase) {
    if (db) {
      this.db = db;
    } else {
      try {
        // Try expo-sqlite if available
        const SQLite = require('expo-sqlite');
        const expoDb = SQLite.openDatabaseSync('synced-catalog.db');
        // withTransactionSync can't wrap async bodies, so transactions are explicit
        // BEGIN/COMMIT on this connection, one at a time.
        let transactionTail: Promise<unknown> = Promise.resolve();
        this.db = {
          exec: async (sql) => expoDb.execSync(sql),
          run: async (sql, params = []) => expoDb.runSync(sql, params),
          get: async (sql, params = []) => expoDb.getFirstSync(sql, params),
          all: async (sql, params = []) => expoDb.getAllSync(sql, params),
          query: (sql, params = []) => expoDb.getAllAsync(sql, params),
          queryFirst: (sql, params = []) => expoDb.getFirstAsync(sql, params),
          transaction: (action) => {
            const run = transactionTail.then(async () => {
              expoDb.execSync('BEGIN IMMEDIATE');
              try {
                const result = await action(this.db);
                expoDb.execSync('COMMIT');
                return result;
              } catch (error) {
                try { expoDb.execSync('ROLLBACK'); } catch {}
                throw error;
              }
            });
            transactionTail = run.catch(() => {});
            return run;
          },
        };
      } catch {
        this.db = new MemorySqlDatabase();
      }
    }
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    if (!this.initializing) {
      const run = this.migrate().then(() => {
        this.initialized = true;
      });
      this.initializing = run;
      run.catch(() => {
        if (this.initializing === run) this.initializing = null;
      });
    }
    await this.initializing;
  }

  /** Applies each pending schema step in its own transaction, bumping PRAGMA user_version with it. */
  private async migrate(): Promise<void> {
    const row = await this.db.get<{ user_version?: number }>('PRAGMA user_version');
    const current = Number(row?.user_version || 0);
    for (let version = current; version < SCHEMA_MIGRATIONS.length; version++) {
      await this.db.transaction(async (tx) => {
        await tx.exec(SCHEMA_MIGRATIONS[version]);
        await tx.exec(`PRAGMA user_version = ${version + 1}`);
      });
    }
  }

  async activeIdentity(libraryId: string): Promise<CatalogIdentity | null> {
    await this.init();
    const row = await this.db.get(
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
    await this.init();
    const row = await this.db.queryFirst(
      'SELECT COUNT(*) as count FROM catalog_songs WHERE library_id = ? AND revision = ?',
      [libraryId, revision]
    );
    return row ? Number(row.count || 0) : 0;
  }

  async beginCatalogStage(libraryId: string, revision: string, total: number): Promise<number> {
    await this.init();
    if (!libraryId.trim() || !revision.trim() || total < 0) {
      throw new Error('Invalid arguments to beginCatalogStage');
    }

    // Counts are dropped after commit so a concurrent page read cannot re-cache pre-commit rows.
    const restarted = await this.db.transaction(async (tx) => {
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
    await this.init();
    await this.db.transaction(async (tx) => {
      await this.ensureState(tx, page.libraryId);
      const state = await this.stateRow(tx, page.libraryId);
      if (state.stageRevision !== page.revision || state.stageTotal !== page.total) {
        throw new Error('Catalog staging revision changed');
      }
      if (page.offset > state.stageNextOffset && page.offset !== 0) {
        throw new Error('Catalog page skipped a checkpoint');
      }

      for (let i = 0; i < page.songs.length; i++) {
        const song = page.songs[i];
        const rank = page.offset + i;
        await tx.run(
          `INSERT OR REPLACE INTO catalog_songs (
            library_id, revision, id, title, artist, album, album_artist, genre, track_number, disc_number, catalog_rank, album_key
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            page.libraryId,
            page.revision,
            song.id,
            song.title,
            song.artist,
            song.album,
            song.albumArtist,
            song.genre,
            song.trackNumber,
            song.discNumber,
            rank,
            song.albumKey,
          ]
        );

        await tx.run(
          'DELETE FROM catalog_song_artists WHERE library_id = ? AND revision = ? AND song_id = ?',
          [page.libraryId, page.revision, song.id]
        );

        const artists = Array.from(new Set(song.artists.map((a) => a.trim()).filter(Boolean)));
        for (const artist of artists) {
          await tx.run(
            'INSERT OR IGNORE INTO catalog_song_artists (library_id, revision, song_id, artist) VALUES (?, ?, ?, ?)',
            [page.libraryId, page.revision, song.id, artist]
          );
        }
      }

      const next = Math.max(state.stageNextOffset, page.nextOffset);
      await tx.run('UPDATE catalog_state SET stage_next_offset = ? WHERE library_id = ?', [next, page.libraryId]);
    });
    this.invalidateSongCounts(page.libraryId, page.revision);
  }

  async publishCatalog(libraryId: string, revision: string, total: number): Promise<void> {
    await this.init();
    const evicted = await this.db.transaction(async (tx) => {
      const state = await this.stateRow(tx, libraryId);
      if (state.stageRevision !== revision || state.stageTotal !== total || state.stageNextOffset < total) {
        throw new Error('Catalog pages are incomplete');
      }
      const countRow = await tx.get(
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
      const others = await tx.all<{ library_id: string }>(
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
    await this.init();
    const rows = await this.db.query<{ library_id: string }>('SELECT library_id FROM catalog_state');
    return rows.map((r) => String(r.library_id));
  }

  async beginCovers(
    libraryId: string,
    revision: string,
    total: number,
    refreshManifest: boolean = false
  ): Promise<CatalogCoverProgress> {
    await this.init();
    if (total < 0) throw new Error('Total must be non-negative');

    return await this.db.transaction(async (tx) => {
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
    await this.init();
    await this.db.transaction(async (tx) => {
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

      for (const cover of page.covers) {
        const keyArgs = [page.libraryId, page.revision, cover.albumKey];
        const previous = await tx.get(
          'SELECT cover_key, available, download_state FROM catalog_covers WHERE library_id = ? AND revision = ? AND album_key = ?',
          keyArgs
        );

        let downloadState = SyncedCatalogStore.COVER_PENDING;
        if (cover.available === false) {
          downloadState = SyncedCatalogStore.COVER_MISSING;
        } else if (previous != null) {
          const prevAvail = previous.available != null ? previous.available !== 0 : null;
          const sourceChanged = previous.cover_key !== cover.coverKey || prevAvail !== cover.available;
          downloadState = sourceChanged ? SyncedCatalogStore.COVER_PENDING : Number(previous.download_state);
        }

        await tx.run(
          `INSERT OR REPLACE INTO catalog_covers (
            library_id, revision, album_key, representative_id, cover_key, available, manifest_seen, download_state
          ) VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
          [
            page.libraryId,
            page.revision,
            cover.albumKey,
            cover.representativeId,
            cover.coverKey,
            cover.available != null ? (cover.available ? 1 : 0) : null,
            downloadState,
          ]
        );
      }

      const next = Math.max(state.coversNextOffset, page.nextOffset);
      await tx.run('UPDATE catalog_state SET covers_next_offset = ? WHERE library_id = ?', [next, page.libraryId]);
    });
  }

  async publishCovers(libraryId: string, revision: string, total: number): Promise<void> {
    await this.init();
    await this.db.transaction(async (tx) => {
      const state = await this.stateRow(tx, libraryId);
      if (
        state.activeRevision !== revision ||
        state.coversRevision !== revision ||
        state.coversTotal !== total ||
        state.coversNextOffset < total
      ) {
        throw new Error('Catalog cover pages are incomplete');
      }
      const countRow = await tx.get(
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
    await this.init();
    const row = await this.db.get(
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
    await this.init();
    const rows = await this.db.query(
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
    await this.init();
    const r = await this.db.get(
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
    await this.init();
    const r = await this.db.queryFirst(
      'SELECT album_key FROM catalog_songs WHERE library_id = ? AND revision = ? AND id = ?',
      [libraryId, revision, songId]
    );
    return r?.album_key != null ? String(r.album_key) : null;
  }

  async markCoverState(libraryId: string, revision: string, albumKey: string, state: number): Promise<void> {
    await this.init();
    await this.db.run(
      'UPDATE catalog_covers SET download_state = ? WHERE library_id = ? AND revision = ? AND album_key = ?',
      [state, libraryId, revision, albumKey]
    );
  }

  async pendingCovers(libraryId: string, revision: string): Promise<StoredCatalogCover[]> {
    await this.init();
    const rows = await this.db.query(
      `SELECT album_key, representative_id, cover_key, available, download_state
       FROM catalog_covers
       WHERE library_id = ? AND revision = ? AND (available IS NULL OR available != 0) AND download_state = ?
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
    await this.init();
    const row = await this.db.get(
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
    albumKey?: string | null
  ): Promise<CatalogPageSlice> {
    await this.init();
    const [where, args] = this.songWhere(libraryId, revision, query, artist, albumArtist, album, genre, albumKey);

    const order =
      albumKey != null || album != null
        ? `CASE WHEN disc_number IS NULL THEN 1 ELSE 0 END, disc_number,
           CASE WHEN track_number IS NULL THEN 1 ELSE 0 END, track_number, catalog_rank`
        : 'catalog_rank';

    // Paging re-reads the same filter repeatedly; count it once per revision instead of on every page.
    const countKey = `${libraryId}\u0000${revision}\u0000${JSON.stringify(args.slice(2))}`;
    const cachedTotal = this.songCounts.get(countKey);
    const generation = this.songCountGeneration;
    const [countRow, rows] = await Promise.all([
      cachedTotal != null
        ? null
        : this.db.queryFirst(`SELECT COUNT(*) as count FROM catalog_songs WHERE ${where}`, args),
      this.db.query(
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
    albumArtist?: string | null
  ): Promise<CatalogGroup[]> {
    await this.init();

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

      const rows = await this.db.query(sql, args);
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

    const [nameCol, groupCol] =
      kind === CatalogGroupKind.AlbumArtist
        ? ['catalog_songs.album_artist', 'catalog_songs.album_artist']
        : kind === CatalogGroupKind.Genre
        ? ['catalog_songs.genre', 'catalog_songs.genre']
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
           FROM catalog_songs
           WHERE ${filter.join(' AND ')}
           GROUP BY ${groupCol} COLLATE NOCASE
           ORDER BY MIN(${nameCol}) COLLATE NOCASE`;

    const rows = await this.db.query(sql, args);
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
    await this.init();
    const row = await this.db.queryFirst(
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
    albumKey?: string | null
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
      clauses.push('genre = ? COLLATE NOCASE');
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

  private async ensureState(tx: SqlDatabase, libraryId: string): Promise<void> {
    await tx.run('INSERT OR IGNORE INTO catalog_state (library_id) VALUES (?)', [libraryId]);
  }

  private async stateRow(tx: SqlDatabase, libraryId: string): Promise<{
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
    const row = await tx.get(
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
