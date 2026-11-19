import type { SqlDatabase } from './catalogDatabase';

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

export async function migrateCatalog(db: SqlDatabase): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await tx.queryFirst<{ user_version: number }>('PRAGMA user_version');
    for (let version = row?.user_version ?? 0; version < SCHEMA_MIGRATIONS.length; version++) {
      await tx.exec(SCHEMA_MIGRATIONS[version]);
      await tx.exec(`PRAGMA user_version = ${version + 1}`);
    }
  });
}
