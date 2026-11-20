import type { ArtImage, CatalogCover, CatalogCoversPage, CatalogPage, CatalogSong, LibraryFilter, LibraryGroup, LibraryPage, FolderPage, Song } from './types';
import { REMOTE_API_PREFIX, CATALOG_PAGE_LIMIT, nullableJsonBoolean, requiredInteger, nullablePositiveInteger, parseRating, requiredString, nullableString, assertIntegerArgument, jsonBoolean, type RemoteApiRequests } from './remoteApiProtocol';

function parseCatalogSong(v: any): CatalogSong {
  let artists: string[] = [];
  if (Array.isArray(v.artists)) {
    if (v.artists.some((artist: unknown) => typeof artist !== 'string')) {
      throw new Error("Catalog field 'artists' is invalid");
    }
    artists = v.artists.filter((s: string) => s.trim().length > 0);
  } else if (v.artist && String(v.artist).trim()) {
    artists = [String(v.artist).trim()];
  } else if (v.artists != null) {
    throw new Error("Catalog field 'artists' is invalid");
  }
  return {
    id: requiredInteger(v.id, 'id', 1),
    title: String(v.title || ''),
    artist: String(v.artist || ''),
    album: String(v.album || ''),
    albumArtist: String(v.album_artist || ''),
    genre: String(v.genre || ''),
    trackNumber: nullablePositiveInteger(v.track_number, 'track_number'),
    discNumber: nullablePositiveInteger(v.disc_number, 'disc_number'),
    albumKey: nullableString(v.album_key, 'album_key'),
    artists,
  };
}

export class CatalogApi {
  constructor(private readonly requests: Pick<RemoteApiRequests, 'jsonGet' | 'command' | 'readArt' | 'downloadArtRequest'>) {}

  async library(
    offset: number = 0,
    limit: number = 50,
    query?: string | null,
    filter: LibraryFilter = {},
    signal?: AbortSignal,
  ): Promise<LibraryPage> {
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new Error('Invalid library offset or limit');
    }
    if (filter.artist != null && filter.albumArtist != null) {
      throw new Error('Use artist or albumArtist, not both');
    }
    const params: [string, string][] = [
      ['offset', offset.toString()],
      ['limit', limit.toString()],
    ];
    if (query != null) params.push(['q', query]);
    if (filter.artist != null) params.push(['artist', filter.artist]);
    if (filter.albumArtist != null) params.push(['album_artist', filter.albumArtist]);
    if (filter.album != null) params.push(['album', filter.album]);
    if (filter.genre != null) params.push(['genre', filter.genre]);

    const json = await this.requests.jsonGet(`${REMOTE_API_PREFIX}/library`, params, signal);
    const songs: Song[] = (Array.isArray(json.songs) ? json.songs : []).map((s: any) => ({
      index: Number(s.index != null ? s.index : -1),
      title: String(s.title || ''),
      artist: String(s.artist || ''),
      album: String(s.album || ''),
      offset: s.offset !== undefined ? Number(s.offset) : null,
      albumArtist: s.album_artist ? String(s.album_artist) : '',
      genre: s.genre ? String(s.genre) : '',
      trackNumber: s.track_number !== undefined ? Number(s.track_number) : null,
      discNumber: s.disc_number !== undefined ? Number(s.disc_number) : null,
      albumKey: s.album_key ? String(s.album_key) : null,
    }));
    return {
      total: Number(json.total || 0),
      songs,
    };
  }

  async catalog(
    offset: number = 0,
    limit: number = CATALOG_PAGE_LIMIT,
    revision?: string | null
  ): Promise<CatalogPage> {
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > CATALOG_PAGE_LIMIT) {
      throw new Error('Invalid catalog offset or limit');
    }
    if (revision != null && !revision.trim()) {
      throw new Error('Revision cannot be blank');
    }
    const params: [string, string][] = [
      ['offset', offset.toString()],
      ['limit', limit.toString()],
    ];
    if (revision) params.push(['revision', revision]);

    const json = await this.requests.jsonGet(`${REMOTE_API_PREFIX}/catalog`, params);
    const songs = (Array.isArray(json.songs) ? json.songs : []).map(parseCatalogSong);

    const page: CatalogPage = {
      libraryId: requiredString(json.library_id, 'library_id'),
      revision: requiredString(json.revision, 'revision'),
      total: requiredInteger(json.total, 'total', 0),
      offset: requiredInteger(json.offset, 'offset', 0),
      nextOffset: requiredInteger(json.next_offset, 'next_offset', 0),
      songs,
    };

    if (!page.libraryId || !page.revision) {
      throw new Error('Catalog identity is missing');
    }
    if (page.offset !== offset || page.nextOffset < page.offset || page.nextOffset > page.total) {
      throw new Error('Invalid catalog page range');
    }
    if (page.nextOffset - page.offset !== page.songs.length) {
      throw new Error('Catalog page size does not match its range');
    }

    return page;
  }

  async catalogCovers(
    offset: number = 0,
    limit: number = CATALOG_PAGE_LIMIT,
    revision: string = ''
  ): Promise<CatalogCoversPage> {
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > CATALOG_PAGE_LIMIT || !revision.trim()) {
      throw new Error('Invalid catalog covers parameters');
    }
    const json = await this.requests.jsonGet(`${REMOTE_API_PREFIX}/catalog/covers`, [
      ['revision', revision],
      ['offset', offset.toString()],
      ['limit', limit.toString()],
    ]);

    const covers: CatalogCover[] = (Array.isArray(json.covers) ? json.covers : []).map((v: any) => ({
      albumKey: requiredString(v.album_key, 'album_key'),
      representativeId: requiredInteger(v.representative_id, 'representative_id', 1),
      coverKey: requiredString(v.cover_key, 'cover_key'),
      available: nullableJsonBoolean(v.available, 'available'),
    }));

    const page: CatalogCoversPage = {
      libraryId: requiredString(json.library_id, 'library_id'),
      revision: requiredString(json.revision, 'revision'),
      total: requiredInteger(json.total, 'total', 0),
      offset: requiredInteger(json.offset, 'offset', 0),
      nextOffset: requiredInteger(json.next_offset, 'next_offset', 0),
      covers,
    };

    if (!page.libraryId || page.revision !== revision) {
      throw new Error('Catalog cover identity does not match');
    }
    if (page.offset !== offset || page.nextOffset < page.offset || page.nextOffset > page.total) {
      throw new Error('Invalid catalog cover page range');
    }
    if (page.nextOffset - page.offset !== page.covers.length) {
      throw new Error('Catalog cover page size does not match its range');
    }
    if (page.covers.some((c) => !c.albumKey || !c.coverKey)) {
      throw new Error('Catalog cover key is missing');
    }

    return page;
  }

  async catalogArt(revision: string, representativeId: number, coverKey: string): Promise<ArtImage | null> {
    return this.requests.readArt(`${REMOTE_API_PREFIX}/catalog/art`, this.catalogArtParams(revision, representativeId, coverKey));
  }

  async downloadCatalogArt(fileUri: string, revision: string, representativeId: number, coverKey: string): Promise<boolean> {
    return this.requests.downloadArtRequest(fileUri, `${REMOTE_API_PREFIX}/catalog/art`, this.catalogArtParams(revision, representativeId, coverKey));
  }

  private catalogArtParams(revision: string, representativeId: number, coverKey: string): [string, string][] {
    if (!revision.trim() || !Number.isSafeInteger(representativeId) || representativeId <= 0 || !coverKey.trim()) {
      throw new Error('Invalid catalog art parameters');
    }
    return [
      ['revision', revision],
      ['representative_id', representativeId.toString()],
      ['cover_key', coverKey],
    ];
  }

  async artists(signal?: AbortSignal): Promise<LibraryGroup[]> {
    return this.groups(`${REMOTE_API_PREFIX}/library/artists`, [], 'artists', signal);
  }

  async albumArtists(): Promise<LibraryGroup[]> {
    return this.groups(`${REMOTE_API_PREFIX}/library/album_artists`, [], 'artists');
  }

  async genres(signal?: AbortSignal): Promise<LibraryGroup[]> {
    return this.groups(`${REMOTE_API_PREFIX}/library/genres`, [], 'genres', signal);
  }

  async albums(filter: LibraryFilter = {}, signal?: AbortSignal): Promise<LibraryGroup[]> {
    if (filter.artist != null && filter.albumArtist != null) {
      throw new Error('Use artist or albumArtist, not both');
    }
    if (filter.album != null) {
      throw new Error('Album lookup accepts only an artist grouping filter');
    }
    if (filter.genre != null) {
      throw new Error('Album lookup does not accept a genre filter');
    }
    const params: [string, string][] = [];
    if (filter.artist) params.push(['artist', filter.artist]);
    if (filter.albumArtist) params.push(['album_artist', filter.albumArtist]);

    return this.groups(`${REMOTE_API_PREFIX}/library/albums`, params, 'albums', signal);
  }

  async topRatedAlbums(): Promise<LibraryGroup[]> {
    return this.groups(`${REMOTE_API_PREFIX}/library/top_rated_albums`, [], 'albums');
  }

  async folderRoots(): Promise<Array<{ id: string; name: string; available: boolean }>> {
    const json = await this.requests.jsonGet(`${REMOTE_API_PREFIX}/folders/roots`);
    return (Array.isArray(json.roots) ? json.roots : []).map((root: any) => ({
      id: String(root.id || ''), name: String(root.name || ''), available: jsonBoolean(root.available),
    }));
  }

  async folder(path: string = '', offset: number = 0, root: string = 'sd'): Promise<FolderPage> {
    assertIntegerArgument(offset, 'Offset', 0);
    const json = await this.requests.jsonGet(`${REMOTE_API_PREFIX}/folders`, [
      ['root', root], ['path', path], ['offset', String(offset)], ['limit', '50'],
    ]);
    return {
      root: String(json.root || root), path: String(json.path || ''),
      parent: json.parent == null ? null : String(json.parent),
      total: Number(json.total || 0), folderCount: Number(json.folder_count || 0),
      offset: Number(json.offset || 0), nextOffset: Number(json.next_offset || 0),
      entries: (Array.isArray(json.entries) ? json.entries : []).map((item: any) => ({
        type: item.type, name: String(item.name || ''),
        index: item.index == null ? undefined : Number(item.index),
        title: item.title == null ? undefined : String(item.title),
        artist: item.artist == null ? undefined : String(item.artist),
      })),
    };
  }

  async playFolderTrack(path: string, root: string = 'sd'): Promise<void> {
    await this.requests.command('/folders/play', [['root', root], ['path', path]]);
  }

  async recent(offset: number = 0): Promise<{ songs: Song[]; total: number; nextOffset: number }> {
    assertIntegerArgument(offset, 'Offset', 0);
    const json = await this.requests.jsonGet(`${REMOTE_API_PREFIX}/recent`, [['offset', String(offset)], ['limit', '50']]);
    return {
      total: Number(json.total || 0), nextOffset: Number(json.next_offset || 0),
      songs: (Array.isArray(json.songs) ? json.songs : []).map((song: any) => ({
        index: Number(song.index), title: String(song.title || ''),
        artist: String(song.artist || ''), album: String(song.album || ''),
        lastPlayed: Number(song.last_played || 0),
      })),
    };
  }

  private async groups(
    path: string,
    params: [string, string][],
    key: 'albums' | 'genres' | 'artists',
    signal?: AbortSignal,
  ): Promise<LibraryGroup[]> {
    const json = await this.requests.jsonGet(path, params, signal);
    const arr = Array.isArray(json[key]) ? json[key] : [];
    return arr.map((g: any) => ({
      ...(parseRating(g.stars) ? { stars: g.stars } : {}),
      name: String(g.name || ''),
      count: Number(g.count || 0),
      index: Number(g.index || 0),
      albumArtist: String(g.album_artist || ''),
      albumKey: g.album_key ? String(g.album_key) : null,
    }));
  }
}
