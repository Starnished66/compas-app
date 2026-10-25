import { MemorySqlDatabase, SqlDatabase, SyncedCatalogStore } from '../SyncedCatalogStore';
import { CatalogPage } from '../types';

/** Records statements and tracks PRAGMA user_version so migrations can be checked without native sqlite. */
class VersionedMemoryDatabase extends MemorySqlDatabase {
  readonly executed: string[] = [];

  constructor(public userVersion: number) {
    super();
  }

  async exec(sql: string): Promise<void> {
    const pragma = sql.match(/PRAGMA user_version = (\d+)/);
    if (pragma) this.userVersion = Number(pragma[1]);
    else this.executed.push(sql);
    await super.exec(sql);
  }

  async all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    if (sql.trim() === 'PRAGMA user_version') return [{ user_version: this.userVersion } as T];
    return super.all<T>(sql, params);
  }
}

describe('SyncedCatalogStore migrations', () => {
  it('runs every step on a fresh database', async () => {
    const db = new VersionedMemoryDatabase(0);
    await new SyncedCatalogStore(db).init();
    expect(db.userVersion).toBe(2);
    expect(db.executed).toHaveLength(2);
    expect(db.executed[1]).toContain('catalog_songs_album_artist_nocase');
  });

  it('only applies pending steps to an existing v1 install', async () => {
    const db = new VersionedMemoryDatabase(1);
    await new SyncedCatalogStore(db).init();
    expect(db.userVersion).toBe(2);
    expect(db.executed).toHaveLength(1);
    expect(db.executed[0]).toContain('DROP INDEX IF EXISTS catalog_songs_album_artist');
  });

  it('does nothing when already current, and runs once under concurrent callers', async () => {
    const current = new VersionedMemoryDatabase(2);
    await new SyncedCatalogStore(current).init();
    expect(current.executed).toHaveLength(0);

    const fresh = new VersionedMemoryDatabase(0);
    const store = new SyncedCatalogStore(fresh);
    await Promise.all([store.init(), store.init(), store.activeIdentity('lib')]);
    expect(fresh.executed).toHaveLength(2);
  });
});

let nodeSqlite: any = null;
try {
  nodeSqlite = require('node:sqlite');
} catch {
  // Older Node without the built-in sqlite module; the native-backed tests below are skipped.
}

/** Real SQLite through node:sqlite, shaped like the expo adapter (serialized explicit transactions). */
function nodeSqliteDatabase(): SqlDatabase & { statements: string[] } {
  const raw = new nodeSqlite.DatabaseSync(':memory:');
  const statements: string[] = [];
  let tail: Promise<unknown> = Promise.resolve();
  const db: SqlDatabase & { statements: string[] } = {
    statements,
    exec: async (sql) => raw.exec(sql),
    run: async (sql, params = []) => {
      const result = raw.prepare(sql).run(...params);
      return { changes: Number(result.changes) };
    },
    get: async (sql, params = []) => {
      statements.push(sql);
      return raw.prepare(sql).get(...params) ?? null;
    },
    all: async (sql, params = []) => {
      statements.push(sql);
      return raw.prepare(sql).all(...params);
    },
    query: async (sql, params = []) => db.all(sql, params) as Promise<any[]>,
    queryFirst: async (sql, params = []) => db.get(sql, params) as Promise<any>,
    transaction: (action) => {
      const run = tail.then(async () => {
        raw.exec('BEGIN IMMEDIATE');
        try {
          const result = await action(db);
          raw.exec('COMMIT');
          return result;
        } catch (error) {
          raw.exec('ROLLBACK');
          throw error;
        }
      });
      tail = run.catch(() => {});
      return run;
    },
  };
  return db;
}

function page(libraryId: string, revision: string, count: number): CatalogPage {
  const songs = Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    title: `Song ${i}`,
    artist: i % 2 ? 'Beta' : 'Alpha',
    artists: [i % 2 ? 'Beta' : 'Alpha'],
    album: 'Album',
    albumArtist: i % 2 ? 'BETA' : 'alpha',
    genre: 'Rock',
    trackNumber: i + 1,
    discNumber: 1,
    albumKey: 'album-key',
  }));
  return { libraryId, revision, offset: 0, nextOffset: count, total: count, songs } as unknown as CatalogPage;
}

async function publish(store: SyncedCatalogStore, libraryId: string, revision: string, count: number) {
  await store.beginCatalogStage(libraryId, revision, count);
  await store.writeCatalogPage(page(libraryId, revision, count));
  await store.publishCatalog(libraryId, revision, count);
}

(nodeSqlite ? describe : describe.skip)('SyncedCatalogStore on SQLite', () => {
  it('filters case-insensitively and counts each filter once per revision', async () => {
    const db = nodeSqliteDatabase();
    const store = new SyncedCatalogStore(db);
    await publish(store, 'lib', 'r1', 6);

    const counts = () => db.statements.filter((sql) => sql.includes('COUNT(*)') && sql.includes('album_artist')).length;
    const first = await store.songPage('lib', 'r1', 0, 2, null, null, 'Alpha');
    const second = await store.songPage('lib', 'r1', 2, 2, null, null, 'ALPHA');
    expect(first.total).toBe(3);
    expect(second.total).toBe(3);
    expect(counts()).toBe(2); // the differently-cased filter is its own cache entry
    await store.songPage('lib', 'r1', 2, 2, null, null, 'Alpha');
    expect(counts()).toBe(2);

    const byArtist = await store.songPage('lib', 'r1', 0, 10, null, 'beta');
    expect(byArtist.total).toBe(3);
    expect(byArtist.songs.map((s) => s.id)).toEqual([2, 4, 6]);
  });

  it('keeps only the most recently published libraries', async () => {
    const store = new SyncedCatalogStore(nodeSqliteDatabase());
    const now = jest.spyOn(Date, 'now');
    for (const [i, id] of ['a', 'b', 'c', 'd'].entries()) {
      now.mockReturnValue(1000 + i);
      await publish(store, id, 'r', 2);
    }
    now.mockRestore();
    expect((await store.retainedLibraryIds()).sort()).toEqual(['b', 'c', 'd']);
    await expect(store.activeIdentity('a')).resolves.toBeNull();
    await expect(store.songPage('a', 'r', 0, 10)).resolves.toEqual({ total: 0, songs: [] });
  });
});
