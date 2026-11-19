import type { SqlConnection } from './catalogDatabase';
import type { CatalogCoversPage, CatalogPage } from './types';

type Row = (string | number | null)[];
const MAX_BINDINGS = 900;

async function insertRows(tx: SqlConnection, sql: string, rows: Row[], suffix = ''): Promise<void> {
  if (!rows.length) return;
  const placeholders = `(${rows[0].map(() => '?').join(', ')})`;
  const batchSize = Math.floor(MAX_BINDINGS / rows[0].length);
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    await tx.run(`${sql} VALUES ${batch.map(() => placeholders).join(', ')} ${suffix}`, batch.flat());
  }
}

export async function writeSongRows(tx: SqlConnection, page: CatalogPage): Promise<void> {
  const { libraryId, revision, songs, offset } = page;
  await insertRows(tx, `INSERT OR REPLACE INTO catalog_songs (
    library_id, revision, id, title, artist, album, album_artist, genre, track_number, disc_number, catalog_rank, album_key
  )`, songs.map((song, index) => [
    libraryId, revision, song.id, song.title, song.artist, song.album, song.albumArtist, song.genre,
    song.trackNumber, song.discNumber, offset + index, song.albumKey,
  ]));

  for (let start = 0; start < songs.length; start += MAX_BINDINGS - 2) {
    const ids = songs.slice(start, start + MAX_BINDINGS - 2).map((song) => song.id);
    await tx.run(
      `DELETE FROM catalog_song_artists WHERE library_id = ? AND revision = ? AND song_id IN (${ids.map(() => '?').join(', ')})`,
      [libraryId, revision, ...ids]
    );
  }
  await insertRows(tx, 'INSERT OR IGNORE INTO catalog_song_artists (library_id, revision, song_id, artist)',
    songs.flatMap((song) => [...new Set(song.artists.map((artist) => artist.trim()).filter(Boolean))]
      .map((artist) => [libraryId, revision, song.id, artist]))
  );
}

export async function writeCoverRows(
  tx: SqlConnection, page: CatalogCoversPage, pending: number, missing: number
): Promise<void> {
  await insertRows(tx, `INSERT INTO catalog_covers (
    library_id, revision, album_key, representative_id, cover_key, available, manifest_seen, download_state
  )`, page.covers.map((cover) => [
    page.libraryId, page.revision, cover.albumKey, cover.representativeId, cover.coverKey,
    cover.available == null ? null : Number(cover.available), 1, cover.available === false ? missing : pending,
  ]), `ON CONFLICT(library_id, revision, album_key) DO UPDATE SET
    representative_id = excluded.representative_id,
    cover_key = excluded.cover_key,
    available = excluded.available,
    manifest_seen = excluded.manifest_seen,
    download_state = CASE
      WHEN excluded.available IS NOT 0 AND catalog_covers.cover_key = excluded.cover_key
        AND (catalog_covers.available != 0) IS excluded.available THEN catalog_covers.download_state
      ELSE excluded.download_state
    END`);
}
