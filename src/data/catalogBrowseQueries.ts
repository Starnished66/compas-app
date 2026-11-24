import type { SqlDatabase } from './catalogDatabase';
import type { CatalogSong } from './types';

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

export enum CatalogGroupKind {
  Artist = 'Artist',
  AlbumArtist = 'AlbumArtist',
  Album = 'Album',
  Genre = 'Genre',
}

const SONG_COUNT_CACHE_LIMIT = 64;

function catalogSongFromRow(r: any): CatalogSong {
  return {
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
  };
}

function groupQuery(kind: CatalogGroupKind, nameCol: string, groupCol: string, genreJoin: string, where: string): string {
  return kind === CatalogGroupKind.Album
        ? `SELECT MAX(catalog_songs.album) as name,
                  COUNT(*) as count,
                  MIN(catalog_songs.id) as idx,
                  MAX(catalog_songs.album_artist) as album_artist,
                  catalog_songs.album_key as album_key
           FROM catalog_songs
           WHERE ${where}
           GROUP BY catalog_songs.album_key
           ORDER BY MAX(catalog_songs.album) COLLATE NOCASE`
        : `SELECT MIN(${nameCol}) as name,
                  COUNT(DISTINCT catalog_songs.id) as count,
                  MIN(catalog_songs.id) as idx,
                  '' as album_artist,
                  NULL as album_key
           FROM catalog_songs ${genreJoin}
           WHERE ${where}
           GROUP BY ${groupCol} COLLATE NOCASE
           ORDER BY MIN(${nameCol}) COLLATE NOCASE`;
}

function catalogGroupFromRow(r: any): CatalogGroup {
  return {
    name: String(r.name || ''),
    count: Number(r.count || 0),
    index: Number(r.idx || 0),
    albumArtist: String(r.album_artist || ''),
    albumKey: r.album_key ? String(r.album_key) : null,
  };
}

export class CatalogBrowseQueries {
  // Filtered song totals per library/revision/filter; a published revision's rows never change.
  private songCounts = new Map<string, number>();
  private songCountGeneration = 0;

  constructor(private readonly database: () => Promise<SqlDatabase>) {}

  async activeSongCount(libraryId: string, revision: string): Promise<number> {
    const db = await this.database();
    const row = await db.queryFirst(
      'SELECT COUNT(*) as count FROM catalog_songs WHERE library_id = ? AND revision = ?',
      [libraryId, revision]
    );
    return row ? Number(row.count || 0) : 0;
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

    return { total, songs: rows.map(catalogSongFromRow) };
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

    if (kind === CatalogGroupKind.Artist) return this.artistGroups(db, libraryId, revision, query, albumArtist);

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

    const sql = groupQuery(kind, nameCol, groupCol, genreJoin, filter.join(' AND '));
    const rows = await db.query(sql, args);
    return rows.map(catalogGroupFromRow);
  }

  private async artistGroups(
    db: SqlDatabase,
    libraryId: string,
    revision: string,
    query?: string | null,
    albumArtist?: string | null,
  ): Promise<CatalogGroup[]> {
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

  async albumKeysForTrack(
    libraryId: string,
    revision: string,
    title: string,
    artist: string,
    album: string
  ): Promise<string[]> {
    const db = await this.database();
    const rows = await db.query<{ album_key: string }>(
      `SELECT DISTINCT album_key FROM catalog_songs
       WHERE library_id = ? AND revision = ? AND
             title = ? COLLATE NOCASE AND artist = ? COLLATE NOCASE AND album = ? COLLATE NOCASE AND
             album_key IS NOT NULL
       LIMIT 2`,
      [libraryId, revision, title, artist, album]
    );
    return rows.map((row) => String(row.album_key));
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

  invalidateSongCounts(libraryId: string, revision?: string): void {
    this.songCountGeneration++;
    const prefix = revision != null ? `${libraryId}\u0000${revision}\u0000` : `${libraryId}\u0000`;
    for (const key of Array.from(this.songCounts.keys())) {
      if (key.startsWith(prefix)) this.songCounts.delete(key);
    }
  }
}
