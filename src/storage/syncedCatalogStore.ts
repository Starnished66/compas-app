/**
 * Durable per-library catalog staging and active snapshot store.
 * Direct port of SyncedCatalogStore.kt.
 * Schema v3:
 *  - catalog_state
 *  - catalog_songs
 *  - catalog_song_artists
 *  - catalog_covers
 */

import { CatalogPage, CatalogSong, CatalogCoversPage } from '../core/models';

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
  albumArtist?: string;
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

export const COVER_PENDING = 0;
export const COVER_STORED = 1;
export const COVER_MISSING = 2;
export const COVER_PERMANENT_FAILURE = 3;

export type GroupKind = 'Artist' | 'AlbumArtist' | 'Album' | 'Genre';

export interface ICatalogDb {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: any[]): Promise<void>;
  getAll<T = any>(sql: string, params?: any[]): Promise<T[]>;
  getFirst<T = any>(sql: string, params?: any[]): Promise<T | null>;
  transaction<T>(action: () => Promise<T>): Promise<T>;
}

export class MemoryCatalogDb implements ICatalogDb {
  // Lightweight in-memory relational store to power tests and offline headless environments
  private stateTable = new Map<string, any>();
  private songsTable: any[] = [];
  private songArtistsTable: any[] = [];
  private coversTable: any[] = [];

  async exec(_sql: string): Promise<void> {
    // schema is pre-initialized in memory structures
  }

  async run(sql: string, params: any[] = []): Promise<void> {
    const trimmed = sql.trim();
    if (trimmed.startsWith('INSERT INTO catalog_state') || trimmed.startsWith('INSERT OR IGNORE INTO catalog_state')) {
      const libId = params[0];
      if (!this.stateTable.has(libId)) {
        this.stateTable.set(libId, {
          library_id: libId,
          active_revision: null,
          active_total: 0,
          stage_revision: null,
          stage_total: 0,
          stage_next_offset: 0,
          covers_revision: null,
          covers_total: 0,
          covers_next_offset: 0,
          covers_complete: 0,
        });
      }
    }
  }

  async getAll<T = any>(_sql: string, _params: any[] = []): Promise<T[]> {
    return [];
  }

  async getFirst<T = any>(_sql: string, _params: any[] = []): Promise<T | null> {
    return null;
  }

  async transaction<T>(action: () => Promise<T>): Promise<T> {
    return action();
  }
}

let SQLiteModule: typeof import('expo-sqlite') | null = null;
try {
  SQLiteModule = require('expo-sqlite');
} catch {
  // Not in native Expo runtime
}

export class SyncedCatalogStore {
  private dbPromise: Promise<any> | null = null;
  private isMemory = false;

  // In-memory data structures for fast querying / fallback
  private stateMap = new Map<string, any>();
  private songs: any[] = [];
  private songArtists: any[] = [];
  private covers: any[] = [];

  constructor() {
    this.initDb();
  }

  private async getDb(): Promise<any> {
    if (!this.dbPromise) {
      this.dbPromise = this.initDb();
    }
    return this.dbPromise;
  }

  private async initDb(): Promise<any> {
    if (SQLiteModule && typeof SQLiteModule.openDatabaseAsync === 'function') {
      try {
        const db = await SQLiteModule.openDatabaseAsync('synced-catalog.db');
        await db.execAsync(`
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
        `);
        return db;
      } catch (err) {
        // Fallback to in-memory
      }
    }

    this.isMemory = true;
    return null;
  }

  async activeIdentity(libraryId: string): Promise<CatalogIdentity | null> {
    const db = await this.getDb();
    if (db && !this.isMemory) {
      const row = await db.getFirstAsync(
        'SELECT active_revision, active_total FROM catalog_state WHERE library_id = ?',
        [libraryId]
      );
      if (!row || !row.active_revision) return null;
      return {
        libraryId,
        revision: row.active_revision,
        total: row.active_total,
      };
    }

    const state = this.stateMap.get(libraryId);
    if (!state || !state.active_revision) return null;
    return {
      libraryId,
      revision: state.active_revision,
      total: state.active_total,
    };
  }

  async latestActiveIdentity(): Promise<CatalogIdentity | null> {
    const db = await this.getDb();
    if (db && !this.isMemory) {
      const row = await db.getFirstAsync(
        'SELECT library_id, active_revision, active_total FROM catalog_state WHERE active_revision IS NOT NULL LIMIT 1'
      );
      if (!row || !row.active_revision) return null;
      return {
        libraryId: row.library_id,
        revision: row.active_revision,
        total: row.active_total,
      };
    }

    for (const [libId, state] of this.stateMap.entries()) {
      if (state.active_revision) {
        return {
          libraryId: libId,
          revision: state.active_revision,
          total: state.active_total,
        };
      }
    }
    return null;
  }

  async activeSongCount(libraryId: string, revision: string): Promise<number> {
    const db = await this.getDb();
    if (db && !this.isMemory) {
      const row = await db.getFirstAsync(
        'SELECT COUNT(*) as cnt FROM catalog_songs WHERE library_id = ? AND revision = ?',
        [libraryId, revision]
      );
      return row?.cnt ?? 0;
    }

    return this.songs.filter((s) => s.library_id === libraryId && s.revision === revision).length;
  }

  async beginCatalogStage(libraryId: string, revision: string, total: number): Promise<number> {
    if (!libraryId || !revision || total < 0) {
      throw new Error('Invalid catalog stage parameters');
    }
    const db = await this.getDb();
    if (db && !this.isMemory) {
      await db.runAsync(
        'INSERT OR IGNORE INTO catalog_state (library_id) VALUES (?)',
        [libraryId]
      );
      const current = await db.getFirstAsync(
        'SELECT active_revision, stage_revision, stage_total, stage_next_offset FROM catalog_state WHERE library_id = ?',
        [libraryId]
      );

      if (current?.stage_revision === revision && current?.stage_total === total) {
        return current.stage_next_offset;
      }

      const activeRev = current?.active_revision || '';
      await db.runAsync(
        'DELETE FROM catalog_songs WHERE library_id = ? AND revision != ? AND revision != ?',
        [libraryId, revision, activeRev]
      );
      await db.runAsync(
        'DELETE FROM catalog_songs WHERE library_id = ? AND revision = ?',
        [libraryId, revision]
      );
      await db.runAsync(
        'DELETE FROM catalog_song_artists WHERE library_id = ? AND revision = ?',
        [libraryId, revision]
      );
      await db.runAsync(
        'UPDATE catalog_state SET stage_revision = ?, stage_total = ?, stage_next_offset = 0 WHERE library_id = ?',
        [revision, total, libraryId]
      );
      return 0;
    }

    let state = this.stateMap.get(libraryId);
    if (!state) {
      state = {
        library_id: libraryId,
        active_revision: null,
        active_total: 0,
        stage_revision: null,
        stage_total: 0,
        stage_next_offset: 0,
        covers_revision: null,
        covers_total: 0,
        covers_next_offset: 0,
        covers_complete: 0,
      };
      this.stateMap.set(libraryId, state);
    }

    if (state.stage_revision === revision && state.stage_total === total) {
      return state.stage_next_offset;
    }

    state.stage_revision = revision;
    state.stage_total = total;
    state.stage_next_offset = 0;
    this.songs = this.songs.filter((s) => s.library_id !== libraryId || s.revision === state.active_revision);
    this.songArtists = this.songArtists.filter((s) => s.library_id !== libraryId || s.revision === state.active_revision);
    return 0;
  }

  async writeCatalogPage(page: CatalogPage): Promise<void> {
    const db = await this.getDb();
    if (db && !this.isMemory) {
      await db.withTransactionAsync(async () => {
        const state = await db.getFirstAsync(
          'SELECT stage_revision, stage_total, stage_next_offset FROM catalog_state WHERE library_id = ?',
          [page.libraryId]
        );
        if (!state || state.stage_revision !== page.revision || state.stage_total !== page.total) {
          throw new Error('Catalog staging revision changed');
        }
        if (page.offset > state.stage_next_offset && page.offset !== 0) {
          throw new Error('Catalog page skipped a checkpoint');
        }

        for (let i = 0; i < page.songs.length; i++) {
          const song = page.songs[i]!;
          const rank = page.offset + i;
          await db.runAsync(
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

          await db.runAsync(
            'DELETE FROM catalog_song_artists WHERE library_id = ? AND revision = ? AND song_id = ?',
            [page.libraryId, page.revision, song.id]
          );

          const uniqueArtists = Array.from(new Set(song.artists.filter((a) => a.trim().length > 0)));
          for (const artist of uniqueArtists) {
            await db.runAsync(
              'INSERT OR IGNORE INTO catalog_song_artists (library_id, revision, song_id, artist) VALUES (?, ?, ?, ?)',
              [page.libraryId, page.revision, song.id, artist]
            );
          }
        }

        const next = Math.max(state.stage_next_offset, page.nextOffset);
        await db.runAsync(
          'UPDATE catalog_state SET stage_next_offset = ? WHERE library_id = ?',
          [next, page.libraryId]
        );
      });
      return;
    }

    const state = this.stateMap.get(page.libraryId);
    if (!state || state.stage_revision !== page.revision || state.stage_total !== page.total) {
      throw new Error('Catalog staging revision changed');
    }
    if (page.offset > state.stage_next_offset && page.offset !== 0) {
      throw new Error('Catalog page skipped a checkpoint');
    }

    for (let i = 0; i < page.songs.length; i++) {
      const song = page.songs[i]!;
      const rank = page.offset + i;
      this.songs = this.songs.filter(
        (s) => !(s.library_id === page.libraryId && s.revision === page.revision && s.id === song.id)
      );
      this.songs.push({
        library_id: page.libraryId,
        revision: page.revision,
        id: song.id,
        title: song.title,
        artist: song.artist,
        album: song.album,
        album_artist: song.albumArtist,
        genre: song.genre,
        track_number: song.trackNumber,
        disc_number: song.discNumber,
        catalog_rank: rank,
        album_key: song.albumKey,
      });

      this.songArtists = this.songArtists.filter(
        (s) => !(s.library_id === page.libraryId && s.revision === page.revision && s.song_id === song.id)
      );
      const uniqueArtists = Array.from(new Set(song.artists.filter((a) => a.trim().length > 0)));
      for (const artist of uniqueArtists) {
        this.songArtists.push({
          library_id: page.libraryId,
          revision: page.revision,
          song_id: song.id,
          artist,
        });
      }
    }

    state.stage_next_offset = Math.max(state.stage_next_offset, page.nextOffset);
  }

  async publishCatalog(libraryId: string, revision: string, total: number): Promise<void> {
    const db = await this.getDb();
    if (db && !this.isMemory) {
      await db.withTransactionAsync(async () => {
        const state = await db.getFirstAsync(
          'SELECT stage_revision, stage_total, stage_next_offset FROM catalog_state WHERE library_id = ?',
          [libraryId]
        );
        if (
          !state ||
          state.stage_revision !== revision ||
          state.stage_total !== total ||
          state.stage_next_offset < total
        ) {
          throw new Error('Catalog pages are incomplete');
        }

        const countRow = await db.getFirstAsync(
          'SELECT COUNT(*) as cnt FROM catalog_songs WHERE library_id = ? AND revision = ?',
          [libraryId, revision]
        );
        if ((countRow?.cnt ?? 0) !== total) {
          throw new Error('Catalog row count does not match its total');
        }

        await db.runAsync(
          `UPDATE catalog_state SET
            active_revision = ?,
            active_total = ?,
            stage_revision = NULL,
            stage_total = 0,
            stage_next_offset = 0,
            covers_revision = NULL,
            covers_total = 0,
            covers_next_offset = 0,
            covers_complete = 0
          WHERE library_id = ?`,
          [revision, total, libraryId]
        );

        await db.runAsync(
          'DELETE FROM catalog_songs WHERE library_id = ? AND revision != ?',
          [libraryId, revision]
        );
        await db.runAsync(
          'DELETE FROM catalog_song_artists WHERE library_id = ? AND revision != ?',
          [libraryId, revision]
        );
        await db.runAsync('DELETE FROM catalog_covers WHERE library_id = ?', [libraryId]);
      });
      return;
    }

    const state = this.stateMap.get(libraryId);
    if (!state || state.stage_revision !== revision || state.stage_total !== total || state.stage_next_offset < total) {
      throw new Error('Catalog pages are incomplete');
    }
    const stagedCount = this.songs.filter((s) => s.library_id === libraryId && s.revision === revision).length;
    if (stagedCount !== total) {
      throw new Error('Catalog row count does not match its total');
    }

    state.active_revision = revision;
    state.active_total = total;
    state.stage_revision = null;
    state.stage_total = 0;
    state.stage_next_offset = 0;
    state.covers_revision = null;
    state.covers_total = 0;
    state.covers_next_offset = 0;
    state.covers_complete = 0;

    this.songs = this.songs.filter((s) => s.library_id === libraryId && s.revision === revision);
    this.songArtists = this.songArtists.filter((s) => s.library_id === libraryId && s.revision === revision);
    this.covers = this.covers.filter((c) => c.library_id !== libraryId);
  }

  async beginCovers(
    libraryId: string,
    revision: string,
    total: number,
    refreshManifest: boolean = false
  ): Promise<CatalogCoverProgress> {
    if (total < 0) throw new Error('Cover total must be non-negative');
    const db = await this.getDb();
    if (db && !this.isMemory) {
      return db.withTransactionAsync(async () => {
        const state = await db.getFirstAsync(
          'SELECT active_revision, covers_revision, covers_total, covers_next_offset, covers_complete FROM catalog_state WHERE library_id = ?',
          [libraryId]
        );
        if (!state || state.active_revision !== revision) {
          throw new Error('Cannot attach covers to an inactive catalog');
        }

        if (state.covers_revision !== revision || state.covers_total !== total) {
          await db.runAsync('DELETE FROM catalog_covers WHERE library_id = ?', [libraryId]);
          await db.runAsync(
            `UPDATE catalog_state SET
              covers_revision = ?,
              covers_total = ?,
              covers_next_offset = 0,
              covers_complete = 0
            WHERE library_id = ?`,
            [revision, total, libraryId]
          );
        } else if (refreshManifest) {
          await db.runAsync(
            'UPDATE catalog_covers SET manifest_seen = 0 WHERE library_id = ? AND revision = ?',
            [libraryId, revision]
          );
          await db.runAsync(
            'UPDATE catalog_state SET covers_next_offset = 0, covers_complete = 0 WHERE library_id = ?',
            [libraryId]
          );
        }

        const updated = await db.getFirstAsync(
          'SELECT covers_total, covers_next_offset, covers_complete FROM catalog_state WHERE library_id = ?',
          [libraryId]
        );
        return {
          total: updated.covers_total,
          nextOffset: updated.covers_next_offset,
          manifestComplete: Boolean(updated.covers_complete),
        };
      });
    }

    const state = this.stateMap.get(libraryId);
    if (!state || state.active_revision !== revision) {
      throw new Error('Cannot attach covers to an inactive catalog');
    }

    if (state.covers_revision !== revision || state.covers_total !== total) {
      this.covers = this.covers.filter((c) => c.library_id !== libraryId);
      state.covers_revision = revision;
      state.covers_total = total;
      state.covers_next_offset = 0;
      state.covers_complete = 0;
    } else if (refreshManifest) {
      this.covers.forEach((c) => {
        if (c.library_id === libraryId && c.revision === revision) {
          c.manifest_seen = 0;
        }
      });
      state.covers_next_offset = 0;
      state.covers_complete = 0;
    }

    return {
      total: state.covers_total,
      nextOffset: state.covers_next_offset,
      manifestComplete: Boolean(state.covers_complete),
    };
  }

  async writeCoverPage(page: CatalogCoversPage): Promise<void> {
    const db = await this.getDb();
    if (db && !this.isMemory) {
      await db.withTransactionAsync(async () => {
        const state = await db.getFirstAsync(
          'SELECT active_revision, covers_revision, covers_total, covers_next_offset FROM catalog_state WHERE library_id = ?',
          [page.libraryId]
        );
        if (
          !state ||
          state.active_revision !== page.revision ||
          state.covers_revision !== page.revision ||
          state.covers_total !== page.total
        ) {
          throw new Error('Catalog cover staging revision changed');
        }
        if (page.offset > state.covers_next_offset && page.offset !== 0) {
          throw new Error('Catalog cover page skipped a checkpoint');
        }

        for (const cover of page.covers) {
          const prev = await db.getFirstAsync(
            'SELECT cover_key, available, download_state FROM catalog_covers WHERE library_id = ? AND revision = ? AND album_key = ?',
            [page.libraryId, page.revision, cover.albumKey]
          );

          const sourceChanged =
            !prev || prev.cover_key !== cover.coverKey || prev.available !== (cover.available ? 1 : 0);
          const dlState =
            cover.available === false
              ? COVER_MISSING
              : sourceChanged
              ? COVER_PENDING
              : prev.download_state;

          await db.runAsync(
            `INSERT OR REPLACE INTO catalog_covers (
              library_id, revision, album_key, representative_id, cover_key, available, manifest_seen, download_state
            ) VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
            [
              page.libraryId,
              page.revision,
              cover.albumKey,
              cover.representativeId,
              cover.coverKey,
              cover.available === null ? null : cover.available ? 1 : 0,
              dlState,
            ]
          );
        }

        const next = Math.max(state.covers_next_offset, page.nextOffset);
        await db.runAsync(
          'UPDATE catalog_state SET covers_next_offset = ? WHERE library_id = ?',
          [next, page.libraryId]
        );
      });
      return;
    }

    const state = this.stateMap.get(page.libraryId);
    if (!state || state.active_revision !== page.revision || state.covers_revision !== page.revision || state.covers_total !== page.total) {
      throw new Error('Catalog cover staging revision changed');
    }
    if (page.offset > state.covers_next_offset && page.offset !== 0) {
      throw new Error('Catalog cover page skipped a checkpoint');
    }

    for (const cover of page.covers) {
      const idx = this.covers.findIndex(
        (c) => c.library_id === page.libraryId && c.revision === page.revision && c.album_key === cover.albumKey
      );
      const prev = idx >= 0 ? this.covers[idx] : null;
      const sourceChanged = !prev || prev.cover_key !== cover.coverKey || prev.available !== cover.available;
      const dlState = cover.available === false ? COVER_MISSING : sourceChanged ? COVER_PENDING : prev.download_state;

      const record = {
        library_id: page.libraryId,
        revision: page.revision,
        album_key: cover.albumKey,
        representative_id: cover.representativeId,
        cover_key: cover.coverKey,
        available: cover.available,
        manifest_seen: 1,
        download_state: dlState,
      };

      if (idx >= 0) {
        this.covers[idx] = record;
      } else {
        this.covers.push(record);
      }
    }

    state.covers_next_offset = Math.max(state.covers_next_offset, page.nextOffset);
  }

  async publishCovers(libraryId: string, revision: string, total: number): Promise<void> {
    const db = await this.getDb();
    if (db && !this.isMemory) {
      await db.withTransactionAsync(async () => {
        const state = await db.getFirstAsync(
          'SELECT active_revision, covers_revision, covers_total, covers_next_offset FROM catalog_state WHERE library_id = ?',
          [libraryId]
        );
        if (
          !state ||
          state.active_revision !== revision ||
          state.covers_revision !== revision ||
          state.covers_total !== total ||
          state.covers_next_offset < total
        ) {
          throw new Error('Catalog cover pages are incomplete');
        }

        const countRow = await db.getFirstAsync(
          'SELECT COUNT(*) as cnt FROM catalog_covers WHERE library_id = ? AND revision = ? AND manifest_seen = 1',
          [libraryId, revision]
        );
        if ((countRow?.cnt ?? 0) !== total) {
          throw new Error('Catalog cover count does not match its total');
        }

        await db.runAsync(
          'DELETE FROM catalog_covers WHERE library_id = ? AND revision = ? AND manifest_seen = 0',
          [libraryId, revision]
        );
        await db.runAsync(
          'UPDATE catalog_state SET covers_complete = 1 WHERE library_id = ?',
          [libraryId]
        );
      });
      return;
    }

    const state = this.stateMap.get(libraryId);
    if (!state || state.active_revision !== revision || state.covers_revision !== revision || state.covers_total !== total || state.covers_next_offset < total) {
      throw new Error('Catalog cover pages are incomplete');
    }
    const manifestCount = this.covers.filter(
      (c) => c.library_id === libraryId && c.revision === revision && c.manifest_seen === 1
    ).length;
    if (manifestCount !== total) {
      throw new Error('Catalog cover count does not match its total');
    }

    this.covers = this.covers.filter(
      (c) => !(c.library_id === libraryId && c.revision === revision && c.manifest_seen === 0)
    );
    state.covers_complete = 1;
  }

  async coverProgress(libraryId: string, revision: string): Promise<CatalogCoverProgress | null> {
    const db = await this.getDb();
    if (db && !this.isMemory) {
      const row = await db.getFirstAsync(
        'SELECT covers_total, covers_next_offset, covers_complete FROM catalog_state WHERE library_id = ? AND active_revision = ? AND covers_revision = ?',
        [libraryId, revision, revision]
      );
      if (!row) return null;
      return {
        total: row.covers_total,
        nextOffset: row.covers_next_offset,
        manifestComplete: Boolean(row.covers_complete),
      };
    }

    const state = this.stateMap.get(libraryId);
    if (!state || state.active_revision !== revision || state.covers_revision !== revision) return null;
    return {
      total: state.covers_total,
      nextOffset: state.covers_next_offset,
      manifestComplete: Boolean(state.covers_complete),
    };
  }

  async coverForAlbum(
    libraryId: string,
    revision: string,
    albumKey: string
  ): Promise<StoredCatalogCover | null> {
    const db = await this.getDb();
    if (db && !this.isMemory) {
      const row = await db.getFirstAsync(
        'SELECT album_key, representative_id, cover_key, available, download_state FROM catalog_covers WHERE library_id = ? AND revision = ? AND album_key = ?',
        [libraryId, revision, albumKey]
      );
      if (!row) return null;
      return {
        albumKey: row.album_key,
        representativeId: row.representative_id,
        coverKey: row.cover_key,
        available: row.available === null ? null : Boolean(row.available),
        downloadState: row.download_state,
      };
    }

    const c = this.covers.find(
      (x) => x.library_id === libraryId && x.revision === revision && x.album_key === albumKey
    );
    if (!c) return null;
    return {
      albumKey: c.album_key,
      representativeId: c.representative_id,
      coverKey: c.cover_key,
      available: c.available,
      downloadState: c.download_state,
    };
  }

  async markCoverState(
    libraryId: string,
    revision: string,
    albumKey: string,
    state: number
  ): Promise<void> {
    const db = await this.getDb();
    if (db && !this.isMemory) {
      await db.runAsync(
        'UPDATE catalog_covers SET download_state = ? WHERE library_id = ? AND revision = ? AND album_key = ?',
        [state, libraryId, revision, albumKey]
      );
      return;
    }

    const c = this.covers.find(
      (x) => x.library_id === libraryId && x.revision === revision && x.album_key === albumKey
    );
    if (c) {
      c.download_state = state;
    }
  }

  async pendingCovers(libraryId: string, revision: string): Promise<StoredCatalogCover[]> {
    const db = await this.getDb();
    if (db && !this.isMemory) {
      const rows = await db.getAllAsync(
        `SELECT album_key, representative_id, cover_key, available, download_state
         FROM catalog_covers
         WHERE library_id = ? AND revision = ? AND (available IS NULL OR available != 0) AND download_state = ?
         ORDER BY album_key`,
        [libraryId, revision, COVER_PENDING]
      );
      return rows.map((r: any) => ({
        albumKey: r.album_key,
        representativeId: r.representative_id,
        coverKey: r.cover_key,
        available: r.available === null ? null : Boolean(r.available),
        downloadState: r.download_state,
      }));
    }

    return this.covers
      .filter(
        (c) =>
          c.library_id === libraryId &&
          c.revision === revision &&
          c.available !== false &&
          c.download_state === COVER_PENDING
      )
      .sort((a, b) => a.album_key.localeCompare(b.album_key))
      .map((c) => ({
        albumKey: c.album_key,
        representativeId: c.representative_id,
        coverKey: c.cover_key,
        available: c.available,
        downloadState: c.download_state,
      }));
  }

  async completedCoverCount(libraryId: string, revision: string): Promise<number> {
    const db = await this.getDb();
    if (db && !this.isMemory) {
      const row = await db.getFirstAsync(
        'SELECT COUNT(*) as cnt FROM catalog_covers WHERE library_id = ? AND revision = ? AND download_state != ?',
        [libraryId, revision, COVER_PENDING]
      );
      return row?.cnt ?? 0;
    }

    return this.covers.filter(
      (c) => c.library_id === libraryId && c.revision === revision && c.download_state !== COVER_PENDING
    ).length;
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
    const db = await this.getDb();
    if (db && !this.isMemory) {
      const { where, args } = this.buildSongWhere(
        libraryId,
        revision,
        query,
        artist,
        albumArtist,
        album,
        genre,
        albumKey
      );

      const countRow = await db.getFirstAsync(
        `SELECT COUNT(*) as cnt FROM catalog_songs WHERE ${where}`,
        args
      );
      const total = countRow?.cnt ?? 0;

      const order =
        albumKey || album
          ? `CASE WHEN disc_number IS NULL THEN 1 ELSE 0 END, disc_number, ` +
            `CASE WHEN track_number IS NULL THEN 1 ELSE 0 END, track_number, catalog_rank`
          : `catalog_rank`;

      const rows = await db.getAllAsync(
        `SELECT id, title, artist, album, album_artist, genre, track_number, disc_number, album_key
         FROM catalog_songs
         WHERE ${where}
         ORDER BY ${order}
         LIMIT ? OFFSET ?`,
        [...args, limit, offset]
      );

      const songs: CatalogSong[] = rows.map((r: any) => ({
        id: r.id,
        title: r.title,
        artist: r.artist,
        album: r.album,
        albumArtist: r.album_artist,
        genre: r.genre,
        trackNumber: r.track_number,
        discNumber: r.disc_number,
        albumKey: r.album_key,
        artists: [r.artist],
      }));

      return { total, songs };
    }

    // Memory filter
    let list = this.songs.filter((s) => s.library_id === libraryId && s.revision === revision);
    if (artist) {
      const songIdsForArtist = new Set(
        this.songArtists
          .filter(
            (sa) =>
              sa.library_id === libraryId &&
              sa.revision === revision &&
              sa.artist.toLowerCase() === artist.toLowerCase()
          )
          .map((sa) => sa.song_id)
      );
      list = list.filter((s) => songIdsForArtist.has(s.id));
    }
    if (albumArtist) {
      list = list.filter((s) => s.album_artist.toLowerCase() === albumArtist.toLowerCase());
    }
    if (albumKey) {
      list = list.filter((s) => s.album_key === albumKey);
    } else if (album) {
      list = list.filter((s) => s.album.toLowerCase() === album.toLowerCase());
    }
    if (genre) {
      list = list.filter((s) => s.genre.toLowerCase() === genre.toLowerCase());
    }
    if (query && query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.artist.toLowerCase().includes(q) ||
          s.album.toLowerCase().includes(q) ||
          s.album_artist.toLowerCase().includes(q) ||
          s.genre.toLowerCase().includes(q)
      );
    }

    const total = list.length;
    if (albumKey || album) {
      list.sort((a, b) => {
        const dA = a.disc_number ?? 9999;
        const dB = b.disc_number ?? 9999;
        if (dA !== dB) return dA - dB;
        const tA = a.track_number ?? 9999;
        const tB = b.track_number ?? 9999;
        if (tA !== tB) return tA - tB;
        return a.catalog_rank - b.catalog_rank;
      });
    } else {
      list.sort((a, b) => a.catalog_rank - b.catalog_rank);
    }

    const sliced = list.slice(offset, offset + limit).map((s) => ({
      id: s.id,
      title: s.title,
      artist: s.artist,
      album: s.album,
      albumArtist: s.album_artist,
      genre: s.genre,
      trackNumber: s.track_number,
      discNumber: s.disc_number,
      albumKey: s.album_key,
      artists: [s.artist],
    }));

    return { total, songs: sliced };
  }

  async groups(
    libraryId: string,
    revision: string,
    kind: GroupKind,
    query?: string | null,
    artist?: string | null,
    albumArtist?: string | null
  ): Promise<CatalogGroup[]> {
    const db = await this.getDb();
    if (db && !this.isMemory) {
      if (kind === 'Artist') {
        const filter = [
          'catalog_song_artists.library_id = ?',
          'catalog_song_artists.revision = ?',
          "catalog_song_artists.artist != ''",
        ];
        const args: any[] = [libraryId, revision];
        if (albumArtist) {
          filter.push(
            `EXISTS (SELECT 1 FROM catalog_songs WHERE catalog_songs.library_id = catalog_song_artists.library_id AND catalog_songs.revision = catalog_song_artists.revision AND catalog_songs.id = catalog_song_artists.song_id AND catalog_songs.album_artist = ? COLLATE NOCASE)`
          );
          args.push(albumArtist);
        }
        if (query && query.trim()) {
          filter.push('instr(lower(catalog_song_artists.artist), lower(?)) > 0');
          args.push(query.trim());
        }

        const sql = `
          SELECT MIN(catalog_song_artists.artist) as name, COUNT(DISTINCT catalog_song_artists.song_id) as count, MIN(catalog_song_artists.song_id) as idx
          FROM catalog_song_artists
          WHERE ${filter.join(' AND ')}
          GROUP BY catalog_song_artists.artist COLLATE NOCASE
          ORDER BY MIN(catalog_song_artists.artist) COLLATE NOCASE
        `;
        const rows = await db.getAllAsync(sql, args);
        return rows.map((r: any) => ({
          name: r.name,
          count: r.count,
          index: r.idx,
        }));
      }

      const filter = ['catalog_songs.library_id = ?', 'catalog_songs.revision = ?'];
      const args: any[] = [libraryId, revision];
      if (artist) {
        filter.push(
          `EXISTS (SELECT 1 FROM catalog_song_artists artist_membership WHERE artist_membership.library_id = catalog_songs.library_id AND artist_membership.revision = catalog_songs.revision AND artist_membership.song_id = catalog_songs.id AND artist_membership.artist = ? COLLATE NOCASE)`
        );
        args.push(artist);
      }
      if (albumArtist) {
        filter.push('catalog_songs.album_artist = ? COLLATE NOCASE');
        args.push(albumArtist);
      }

      const [nameCol, groupCol] =
        kind === 'AlbumArtist'
          ? ['catalog_songs.album_artist', 'catalog_songs.album_artist']
          : kind === 'Genre'
          ? ['catalog_songs.genre', 'catalog_songs.genre']
          : ['catalog_songs.album', 'catalog_songs.album_key'];

      if (kind !== 'Album') filter.push(`${groupCol} != ''`);
      if (kind === 'Album') filter.push('catalog_songs.album_key IS NOT NULL');
      if (query && query.trim()) {
        filter.push(`instr(lower(${nameCol}), lower(?)) > 0`);
        args.push(query.trim());
      }

      const sql =
        kind === 'Album'
          ? `SELECT MAX(catalog_songs.album) as name, COUNT(*) as count, MIN(catalog_songs.id) as idx, MAX(catalog_songs.album_artist) as album_artist, catalog_songs.album_key
             FROM catalog_songs
             WHERE ${filter.join(' AND ')}
             GROUP BY catalog_songs.album_key
             ORDER BY MAX(catalog_songs.album) COLLATE NOCASE`
          : `SELECT MIN(${nameCol}) as name, COUNT(DISTINCT catalog_songs.id) as count, MIN(catalog_songs.id) as idx, '' as album_artist, NULL as album_key
             FROM catalog_songs
             WHERE ${filter.join(' AND ')}
             GROUP BY ${groupCol} COLLATE NOCASE
             ORDER BY MIN(${nameCol}) COLLATE NOCASE`;

      const rows = await db.getAllAsync(sql, args);
      return rows.map((r: any) => ({
        name: r.name,
        count: r.count,
        index: r.idx,
        albumArtist: r.album_artist || '',
        albumKey: r.album_key || null,
      }));
    }

    // Memory grouping
    if (kind === 'Artist') {
      const songArtistsList = this.songArtists.filter(
        (sa) => sa.library_id === libraryId && sa.revision === revision && sa.artist.trim().length > 0
      );
      const groupsMap = new Map<string, { name: string; songIds: Set<number>; minSongId: number }>();
      for (const sa of songArtistsList) {
        if (query && !sa.artist.toLowerCase().includes(query.trim().toLowerCase())) continue;
        const key = sa.artist.toLowerCase();
        if (!groupsMap.has(key)) {
          groupsMap.set(key, { name: sa.artist, songIds: new Set(), minSongId: sa.song_id });
        }
        const g = groupsMap.get(key)!;
        g.songIds.add(sa.song_id);
        g.minSongId = Math.min(g.minSongId, sa.song_id);
      }
      return Array.from(groupsMap.values())
        .map((g) => ({ name: g.name, count: g.songIds.size, index: g.minSongId }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    }

    let songs = this.songs.filter((s) => s.library_id === libraryId && s.revision === revision);
    if (artist) {
      const songIdsForArtist = new Set(
        this.songArtists
          .filter(
            (sa) =>
              sa.library_id === libraryId &&
              sa.revision === revision &&
              sa.artist.toLowerCase() === artist.toLowerCase()
          )
          .map((sa) => sa.song_id)
      );
      songs = songs.filter((s) => songIdsForArtist.has(s.id));
    }
    if (albumArtist) {
      songs = songs.filter((s) => s.album_artist.toLowerCase() === albumArtist.toLowerCase());
    }

    if (kind === 'Album') {
      songs = songs.filter((s) => s.album_key);
      if (query && query.trim()) {
        const q = query.trim().toLowerCase();
        songs = songs.filter((s) => s.album.toLowerCase().includes(q));
      }
      const groupsMap = new Map<string, { name: string; count: number; minId: number; albumArtist: string; albumKey: string }>();
      for (const s of songs) {
        const key = s.album_key;
        if (!groupsMap.has(key)) {
          groupsMap.set(key, {
            name: s.album,
            count: 0,
            minId: s.id,
            albumArtist: s.album_artist,
            albumKey: s.album_key,
          });
        }
        const g = groupsMap.get(key)!;
        g.count++;
        g.minId = Math.min(g.minId, s.id);
      }
      return Array.from(groupsMap.values())
        .map((g) => ({
          name: g.name,
          count: g.count,
          index: g.minId,
          albumArtist: g.albumArtist,
          albumKey: g.albumKey,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    }

    const field = kind === 'AlbumArtist' ? 'album_artist' : 'genre';
    songs = songs.filter((s) => s[field] && s[field].trim().length > 0);
    if (query && query.trim()) {
      const q = query.trim().toLowerCase();
      songs = songs.filter((s) => s[field].toLowerCase().includes(q));
    }
    const groupsMap = new Map<string, { name: string; songIds: Set<number>; minId: number }>();
    for (const s of songs) {
      const key = s[field].toLowerCase();
      if (!groupsMap.has(key)) {
        groupsMap.set(key, { name: s[field], songIds: new Set(), minId: s.id });
      }
      const g = groupsMap.get(key)!;
      g.songIds.add(s.id);
      g.minId = Math.min(g.minId, s.id);
    }
    return Array.from(groupsMap.values())
      .map((g) => ({ name: g.name, count: g.songIds.size, index: g.minId }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }

  async findAlbumKey(
    libraryId: string,
    revision: string,
    title: string,
    artist: string,
    album: string
  ): Promise<string | null> {
    const db = await this.getDb();
    if (db && !this.isMemory) {
      const row = await db.getFirstAsync(
        `SELECT album_key FROM catalog_songs
         WHERE library_id = ? AND revision = ? AND title = ? COLLATE NOCASE AND artist = ? COLLATE NOCASE AND album = ? COLLATE NOCASE AND album_key IS NOT NULL
         ORDER BY catalog_rank LIMIT 1`,
        [libraryId, revision, title, artist, album]
      );
      return row?.album_key ?? null;
    }

    const match = this.songs.find(
      (s) =>
        s.library_id === libraryId &&
        s.revision === revision &&
        s.title.toLowerCase() === title.toLowerCase() &&
        s.artist.toLowerCase() === artist.toLowerCase() &&
        s.album.toLowerCase() === album.toLowerCase() &&
        s.album_key
    );
    return match?.album_key ?? null;
  }

  private buildSongWhere(
    libraryId: string,
    revision: string,
    query?: string | null,
    artist?: string | null,
    albumArtist?: string | null,
    album?: string | null,
    genre?: string | null,
    albumKey?: string | null
  ) {
    const clauses: string[] = ['library_id = ?', 'revision = ?'];
    const args: any[] = [libraryId, revision];

    if (artist) {
      clauses.push(
        'EXISTS (SELECT 1 FROM catalog_song_artists artist_membership WHERE artist_membership.library_id = catalog_songs.library_id AND artist_membership.revision = catalog_songs.revision AND artist_membership.song_id = catalog_songs.id AND artist_membership.artist = ? COLLATE NOCASE)'
      );
      args.push(artist);
    }
    if (albumArtist) {
      clauses.push('album_artist = ? COLLATE NOCASE');
      args.push(albumArtist);
    }
    if (albumKey) {
      clauses.push('album_key = ?');
      args.push(albumKey);
    } else if (album) {
      clauses.push('album = ? COLLATE NOCASE');
      args.push(album);
    }
    if (genre) {
      clauses.push('genre = ? COLLATE NOCASE');
      args.push(genre);
    }
    if (query && query.trim()) {
      const q = query.trim();
      clauses.push(
        '(instr(lower(title), lower(?)) > 0 OR instr(lower(artist), lower(?)) > 0 OR instr(lower(album), lower(?)) > 0 OR instr(lower(album_artist), lower(?)) > 0 OR instr(lower(genre), lower(?)) > 0)'
      );
      for (let i = 0; i < 5; i++) {
        args.push(q);
      }
    }

    return { where: clauses.join(' AND '), args };
  }
}
