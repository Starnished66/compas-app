import {
  ArtImage,
  Capabilities,
  CatalogCover,
  CatalogCoversPage,
  CatalogPage,
  CatalogSong,
  LibraryFilter,
  LibraryGroup,
  LibraryPage,
  FolderPage,
  PlaylistPage,
  PlayContext,
  PlaybackStatus,
  Playlist,
  QueuePage,
  Song,
} from './types';
import {
  HttpTransport,
  HttpRequest,
  HttpResponse,
  isArtworkPreemptibleTransport,
  isFileDownloadTransport,
} from './HttpTransport';

export class RemoteApiException extends Error {
  readonly statusCode: number;
  readonly responseBody: string;

  constructor(statusCode: number, responseBody: string) {
    super(`Remote API returned HTTP ${statusCode}${responseBody.trim() ? `: ${responseBody}` : ''}`);
    this.name = 'RemoteApiException';
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }

  get pinRequired(): boolean {
    if (this.statusCode !== 401) return false;
    try {
      const json = JSON.parse(this.responseBody);
      return json.code === 'pin_required';
    } catch {
      return false;
    }
  }

  get pinRateLimited(): boolean {
    if (this.statusCode !== 429) return false;
    try {
      const json = JSON.parse(this.responseBody);
      return json.code === 'pin_rate_limited';
    } catch {
      return false;
    }
  }

  get retryAfterSeconds(): number {
    try {
      const json = JSON.parse(this.responseBody);
      const val = parseInt(json.retryAfterSeconds, 10);
      if (!isNaN(val)) {
        return Math.max(1, Math.min(val, 3600));
      }
    } catch {
      // ignore
    }
    return 60;
  }
}

import { bytesToBase64 } from './cryptoUtils';

function jsonBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return false;
}

function nullableJsonBoolean(value: unknown, field: string): boolean | null {
  if (value == null) return null;
  if (typeof value !== 'boolean') throw new Error(`Field '${field}' is invalid`);
  return value;
}

function requiredInteger(value: unknown, field: string, min: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min) {
    throw new Error(`Field '${field}' is missing or invalid`);
  }
  return value;
}

function nullablePositiveInteger(value: unknown, field: string): number | null {
  if (value == null) return null;
  return requiredInteger(value, field, 1);
}

function assertIntegerArgument(value: number, field: string, min: number, max: number = Number.MAX_SAFE_INTEGER): void {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${field} must be an integer between ${min} and ${max}`);
  }
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`Field '${field}' is missing or invalid`);
  return value;
}

function nullableString(value: unknown, field: string): string | null {
  if (value == null) return null;
  const result = requiredString(value, field);
  return result.trim() ? result : null;
}

let commandsSent = 0;

export class RemoteApi {
  static readonly PIN_HEADER = 'X-Compas-PIN';
  static readonly CATALOG_SYNC_FEATURE = 'catalog_sync_v1';
  static readonly CATALOG_PAGE_LIMIT = 100;

  private transport: HttpTransport;
  private pin: string | null;
  private prefix = '/api/v1';

  constructor(transport: HttpTransport, pin?: string | null) {
    if (pin != null && !/^[0-9]{4,12}$/.test(pin)) {
      throw new Error('PIN must contain 4 to 12 digits');
    }
    this.transport = transport;
    this.pin = pin || null;
  }

  setPin(pin: string | null): void {
    if (pin != null && !/^[0-9]{4,12}$/.test(pin)) {
      throw new Error('PIN must contain 4 to 12 digits');
    }
    this.pin = pin || null;
  }

  preemptArtworkRequest(index?: number): void {
    if (index != null) assertIntegerArgument(index, 'Index', 0);
    if (isArtworkPreemptibleTransport(this.transport)) {
      this.transport.preemptArtworkRequest(index);
    }
  }

  async capabilities(): Promise<Capabilities> {
    const json = await this.jsonGet(`${this.prefix}/capabilities`);
    return {
      version: json.version != null ? json.version : 1,
      transports: Array.isArray(json.transports) ? json.transports : [],
      features: Array.isArray(json.features) ? json.features : [],
    };
  }

  async status(): Promise<PlaybackStatus> {
    const json = await this.jsonGet(`${this.prefix}/status`);
    return {
      playing: jsonBoolean(json.playing),
      paused: jsonBoolean(json.paused),
      title: String(json.title || ''),
      artist: String(json.artist || ''),
      album: String(json.album || ''),
      positionSeconds: Number(json.position_seconds || 0),
      durationSeconds: Number(json.duration_seconds || 0),
      volume: Number(json.volume || 0),
      playMode: Number(json.play_mode || 0),
      codec: json.codec ? String(json.codec) : '',
      sourceBitDepth: Number(json.source_bit_depth || 0),
      sourceSampleRateHz: Number(json.source_sample_rate || 0),
      bluetoothAudioOutput: nullableJsonBoolean(json.bluetooth_audio_output, 'bluetooth_audio_output'),
      favorite: json.favorite == null ? null : jsonBoolean(json.favorite),
    };
  }

  async art(index?: number | null): Promise<ArtImage | null> {
    if (index != null) assertIntegerArgument(index, 'Index', 0);
    const params: [string, string][] = index != null ? [['index', index.toString()]] : [];
    const response = await this.send('GET', `${this.prefix}/art`, params);
    if (response.statusCode === 404) return null;
    this.ensureSuccess(response);
    return {
      contentType: response.header('content-type'),
      base64: response.bodyBase64 ?? bytesToBase64(response.body),
    };
  }

  get commandGeneration(): number {
    return commandsSent;
  }

  get canDownloadArt(): boolean {
    return isFileDownloadTransport(this.transport);
  }

  async downloadArt(fileUri: string): Promise<boolean> {
    if (!isFileDownloadTransport(this.transport)) throw new Error('Transport cannot download files');
    const response = await this.transport.download(this.request('GET', `${this.prefix}/art`), fileUri);
    if (response.statusCode === 404) return false;
    this.ensureSuccess(response);
    return true;
  }

  async togglePlayback(): Promise<void> {
    await this.command('/playback/toggle');
  }

  async next(): Promise<void> {
    await this.command('/playback/next');
  }

  async previous(): Promise<void> {
    await this.command('/playback/prev');
  }

  async cyclePlayMode(): Promise<void> {
    await this.command('/playback/mode');
  }

  async setPlayMode(mode: number): Promise<void> {
    assertIntegerArgument(mode, 'Play mode', 0, 3);
    await this.command('/playback/mode', [['mode', mode.toString()]]);
  }

  async seek(seconds: number): Promise<void> {
    assertIntegerArgument(seconds, 'Seconds', 0);
    await this.command('/playback/seek', [['seconds', seconds.toString()]]);
  }

  async setVolume(percent: number): Promise<void> {
    assertIntegerArgument(percent, 'Volume percent', 0, 100);
    await this.command('/playback/volume', [['percent', percent.toString()]]);
  }

  async play(index: number, context: PlayContext = {}, catalogRevision?: string | null): Promise<void> {
    assertIntegerArgument(index, 'Index', 0);
    if (catalogRevision != null && !catalogRevision.trim()) {
      throw new Error('Catalog revision cannot be empty string');
    }
    if (context.artist != null && context.albumArtist != null) {
      throw new Error('Use artist or albumArtist, not both');
    }
    if ((context.artist != null || context.albumArtist != null) && context.album == null) {
      throw new Error('An artist playback context requires an album');
    }
    if (context.playlist != null && (context.artist != null || context.albumArtist != null || context.album != null)) {
      throw new Error('Use playlist or artist/album context');
    }

    const query: [string, string][] = [['index', index.toString()]];
    if (context.playlist != null) query.push(['playlist', context.playlist]);
    if (context.artist != null) query.push(['artist', context.artist]);
    if (context.albumArtist != null) query.push(['album_artist', context.albumArtist]);
    if (context.album != null) query.push(['album', context.album]);
    if (catalogRevision != null) query.push(['catalog_revision', catalogRevision]);

    await this.command('/playback/play', query);
  }

  async addToQueue(index: number, catalogRevision?: string | null): Promise<void> {
    assertIntegerArgument(index, 'Index', 0);
    if (catalogRevision != null && !catalogRevision.trim()) {
      throw new Error('Catalog revision cannot be empty string');
    }
    const params: [string, string][] = [['index', index.toString()]];
    if (catalogRevision != null) params.push(['catalog_revision', catalogRevision]);
    await this.command('/playback/queue', params);
  }

  async queue(offset: number = 0, limit: number = 25): Promise<QueuePage> {
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 25) {
      throw new Error('Invalid queue offset or limit');
    }
    const json = await this.jsonGet(`${this.prefix}/queue`, [
      ['offset', offset.toString()],
      ['limit', limit.toString()],
    ]);
    const songs: Song[] = (Array.isArray(json.songs) ? json.songs : []).map((s: any) => ({
      index: Number(s.index != null ? s.index : -1),
      title: String(s.title || ''),
      artist: String(s.artist || ''),
      album: String(s.album || ''),
      offset: s.offset !== undefined ? Number(s.offset) : null,
    }));
    return {
      total: Number(json.total || 0),
      offset: Number(json.offset !== undefined ? json.offset : offset),
      revision: Number(json.revision || 0),
      songs,
    };
  }

  async removeFromQueue(offset: number, revision: number): Promise<void> {
    assertIntegerArgument(offset, 'Offset', 0);
    assertIntegerArgument(revision, 'Revision', 0);
    await this.command('/queue/remove', [
      ['offset', offset.toString()],
      ['revision', revision.toString()],
    ]);
  }

  async clearQueue(revision: number): Promise<void> {
    assertIntegerArgument(revision, 'Revision', 0);
    await this.command('/queue/clear', [['revision', revision.toString()]]);
  }

  async moveQueueTrack(from: number, to: number, revision: number): Promise<void> {
    assertIntegerArgument(from, 'From', 0);
    assertIntegerArgument(to, 'To', 0);
    assertIntegerArgument(revision, 'Revision', 0);
    await this.command('/queue/move', [['from', String(from)], ['to', String(to)], ['revision', String(revision)]]);
  }

  async playQueueTrack(offset: number, revision: number): Promise<void> {
    assertIntegerArgument(offset, 'Offset', 0);
    assertIntegerArgument(revision, 'Revision', 0);
    await this.command('/queue/play', [['offset', String(offset)], ['revision', String(revision)]]);
  }

  async folderRoots(): Promise<Array<{ id: string; name: string; available: boolean }>> {
    const json = await this.jsonGet(`${this.prefix}/folders/roots`);
    return (Array.isArray(json.roots) ? json.roots : []).map((root: any) => ({
      id: String(root.id || ''), name: String(root.name || ''), available: jsonBoolean(root.available),
    }));
  }

  async folder(path: string = '', offset: number = 0, root: string = 'sd'): Promise<FolderPage> {
    assertIntegerArgument(offset, 'Offset', 0);
    const json = await this.jsonGet(`${this.prefix}/folders`, [
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
    await this.command('/folders/play', [['root', root], ['path', path]]);
  }

  async recent(offset: number = 0): Promise<{ songs: Song[]; total: number; nextOffset: number }> {
    assertIntegerArgument(offset, 'Offset', 0);
    const json = await this.jsonGet(`${this.prefix}/recent`, [['offset', String(offset)], ['limit', '50']]);
    return {
      total: Number(json.total || 0), nextOffset: Number(json.next_offset || 0),
      songs: (Array.isArray(json.songs) ? json.songs : []).map((song: any) => ({
        index: Number(song.index), title: String(song.title || ''),
        artist: String(song.artist || ''), album: String(song.album || ''),
        lastPlayed: Number(song.last_played || 0),
      })),
    };
  }

  async favoriteStates(ids: number[]): Promise<Map<number, boolean>> {
    if (!ids.length || ids.length > 100) throw new Error('Favorite state batch must contain 1 to 100 songs');
    ids.forEach((id) => assertIntegerArgument(id, 'Song ID', 1));
    const json = await this.jsonGet(`${this.prefix}/favorites/state`, [['ids', ids.join(',')]]);
    return new Map((Array.isArray(json.songs) ? json.songs : [])
      .filter((item: any) => item.found)
      .map((item: any) => [Number(item.index), jsonBoolean(item.favorite)]));
  }

  async setFavorite(favorite: boolean, index?: number, catalogRevision?: string | null): Promise<boolean> {
    const params: [string, string][] = index == null ? [['current', '1']] : [['index', String(index)]];
    if (index != null) assertIntegerArgument(index, 'Song ID', 1);
    if (catalogRevision && index != null) params.push(['catalog_revision', catalogRevision]);
    const res = await this.send('POST', `${this.prefix}/favorites/${favorite ? 'add' : 'remove'}`, params);
    this.ensureSuccess(res);
    return jsonBoolean(JSON.parse(res.text()).favorite);
  }

  async library(
    offset: number = 0,
    limit: number = 50,
    query?: string | null,
    filter: LibraryFilter = {}
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

    const json = await this.jsonGet(`${this.prefix}/library`, params);
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
    limit: number = RemoteApi.CATALOG_PAGE_LIMIT,
    revision?: string | null
  ): Promise<CatalogPage> {
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > RemoteApi.CATALOG_PAGE_LIMIT) {
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

    const json = await this.jsonGet(`${this.prefix}/catalog`, params);
    const songs: CatalogSong[] = (Array.isArray(json.songs) ? json.songs : []).map((v: any) => {
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
    });

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
    limit: number = RemoteApi.CATALOG_PAGE_LIMIT,
    revision: string = ''
  ): Promise<CatalogCoversPage> {
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > RemoteApi.CATALOG_PAGE_LIMIT || !revision.trim()) {
      throw new Error('Invalid catalog covers parameters');
    }
    const json = await this.jsonGet(`${this.prefix}/catalog/covers`, [
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
    if (!revision.trim() || !Number.isSafeInteger(representativeId) || representativeId <= 0 || !coverKey.trim()) {
      throw new Error('Invalid catalog art parameters');
    }
    const response = await this.send('GET', `${this.prefix}/catalog/art`, [
      ['revision', revision],
      ['representative_id', representativeId.toString()],
      ['cover_key', coverKey],
    ]);
    if (response.statusCode === 404) return null;
    this.ensureSuccess(response);
    return {
      contentType: response.header('content-type'),
      base64: response.bodyBase64 ?? bytesToBase64(response.body),
    };
  }

  async artists(): Promise<LibraryGroup[]> {
    return this.groups(`${this.prefix}/library/artists`);
  }

  async albumArtists(): Promise<LibraryGroup[]> {
    return this.groups(`${this.prefix}/library/album_artists`);
  }

  async genres(): Promise<LibraryGroup[]> {
    return this.groups(`${this.prefix}/library/genres`);
  }

  async albums(filter: LibraryFilter = {}): Promise<LibraryGroup[]> {
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

    return this.groups(`${this.prefix}/library/albums`, params);
  }

  async playlists(): Promise<Playlist[]> {
    const json = await this.jsonGet(`${this.prefix}/playlists`);
    const playlists = Array.isArray(json.playlists) ? json.playlists : [];
    return playlists.map((p: any) => {
      const name = String(p.name || '');
      const internal = jsonBoolean(p.internal);
      let key = String(p.key || '');
      if (!key) {
        key = internal ? name : name.endsWith('.m3u') ? name.slice(0, -4) : name;
      }
      return {
        name,
        key,
        internal,
        writable: jsonBoolean(p.writable),
      };
    });
  }

  async playlistSongs(key: string): Promise<Song[]> {
    const first = await this.playlistPage(key);
    const songs = [...first.songs];
    let nextOffset = first.nextOffset;
    while (nextOffset > 0 && nextOffset < first.total) {
      const page = await this.playlistPage(key, nextOffset);
      if (page.nextOffset <= nextOffset) break;
      songs.push(...page.songs);
      nextOffset = page.nextOffset;
    }
    return songs;
  }

  async playlistPage(key: string, offset: number = 0): Promise<PlaylistPage> {
    assertIntegerArgument(offset, 'Offset', 0);
    const json = await this.jsonGet(`${this.prefix}/playlists/songs`, [['name', key], ['offset', String(offset)]]);
    const songs: Song[] = (Array.isArray(json.songs) ? json.songs : []).map((s: any) => ({
      index: Number(s.index != null ? s.index : -1), title: String(s.title || ''),
      artist: String(s.artist || ''), album: String(s.album || ''),
      position: s.position == null ? null : Number(s.position),
    }));
    return {
      songs, total: json.total == null ? songs.length : Number(json.total),
      nextOffset: json.next_offset == null ? songs.length : Number(json.next_offset),
      revision: json.revision == null ? null : String(json.revision),
      writable: jsonBoolean(json.writable),
    };
  }

  async createEmptyPlaylist(name: string): Promise<void> {
    RemoteApi.validatePlaylistName(name);
    await this.command('/playlists/create', [['name', name]]);
  }

  async renamePlaylist(key: string, newName: string): Promise<string> {
    RemoteApi.validatePlaylistName(newName);
    const res = await this.send('POST', `${this.prefix}/playlists/rename`, [['name', key], ['new_name', newName]]);
    this.ensureSuccess(res);
    return String(JSON.parse(res.text()).key || newName);
  }

  async deletePlaylist(key: string): Promise<void> {
    await this.command('/playlists/delete', [['name', key]]);
  }

  async removePlaylistTrack(key: string, position: number, revision: string): Promise<string | null> {
    assertIntegerArgument(position, 'Position', 0);
    const res = await this.send('POST', `${this.prefix}/playlists/remove`, [
      ['name', key], ['position', String(position)], ['revision', revision],
    ]);
    this.ensureSuccess(res);
    return JSON.parse(res.text()).revision ?? null;
  }

  async movePlaylistTrack(key: string, from: number, to: number, revision: string): Promise<string | null> {
    assertIntegerArgument(from, 'From', 0);
    assertIntegerArgument(to, 'To', 0);
    const res = await this.send('POST', `${this.prefix}/playlists/move`, [
      ['name', key], ['from', String(from)], ['to', String(to)], ['revision', revision],
    ]);
    this.ensureSuccess(res);
    return JSON.parse(res.text()).revision ?? null;
  }

  async importPlaylist(name: string, body: Uint8Array): Promise<{ entries: number; matched: number }> {
    RemoteApi.validatePlaylistName(name);
    if (!body.length || body.length > 256 * 1024) throw new Error('Playlist file must be 1–256 KiB');
    const res = await this.send('POST', `${this.prefix}/playlists/import`, [['name', name]], body);
    this.ensureSuccess(res);
    const json = JSON.parse(res.text());
    return { entries: Number(json.entries || 0), matched: Number(json.matched || 0) };
  }

  async createPlaylist(name: string, index: number): Promise<void> {
    RemoteApi.validatePlaylistName(name);
    assertIntegerArgument(index, 'Index', 0);
    await this.command('/playlists', [
      ['name', name],
      ['index', index.toString()],
    ]);
  }

  async addToPlaylist(name: string, index: number): Promise<void> {
    RemoteApi.validatePlaylistName(name);
    assertIntegerArgument(index, 'Index', 0);
    await this.command('/playlists/add', [
      ['name', name],
      ['index', index.toString()],
    ]);
  }

  static validatePlaylistName(name: string): void {
    const bytes = new TextEncoder().encode(name).length;
    if (bytes < 1 || bytes > 127 || name.startsWith('.') || name.startsWith('@') ||
        /[\x00-\x1f\x7f/\\:*?"<>|]/.test(name) || name.includes('..') ||
        /[ .]$/.test(name) || /\.m3u8?$/i.test(name) ||
        /^(Favorites|Most Played)$/i.test(name)) {
      throw new Error('Invalid playlist name. Use 1–127 UTF-8 bytes without reserved characters or an M3U extension.');
    }
  }

  /** Matches java.net.URLEncoder used by the Android client for query parameters. */
  static encode(value: string): string {
    return encodeURIComponent(value)
      .replace(/[!'()~]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
      .replace(/%20/g, '+');
  }

  private async groups(path: string, params: [string, string][] = []): Promise<LibraryGroup[]> {
    const json = await this.jsonGet(path, params);
    const key = path.endsWith('/albums') ? 'albums' : path.endsWith('/genres') ? 'genres' : 'artists';
    const arr = Array.isArray(json[key]) ? json[key] : [];
    return arr.map((g: any) => ({
      name: String(g.name || ''),
      count: Number(g.count || 0),
      index: Number(g.index || 0),
      albumArtist: String(g.album_artist || ''),
      albumKey: g.album_key ? String(g.album_key) : null,
    }));
  }

  private async command(path: string, params: [string, string][] = []): Promise<void> {
    // Match the native backend: player commands release the socket from optional artwork reads.
    this.preemptArtworkRequest();
    commandsSent++;
    const res = await this.send('POST', `${this.prefix}${path}`, params);
    this.ensureSuccess(res);
  }

  private async jsonGet(path: string, params: [string, string][] = []): Promise<any> {
    const res = await this.send('GET', path, params);
    this.ensureSuccess(res);
    return JSON.parse(res.text());
  }

  private async send(method: 'GET' | 'POST', path: string, params: [string, string][] = [], body?: Uint8Array): Promise<HttpResponse> {
    return this.transport.execute(this.request(method, path, params, body));
  }

  private request(method: 'GET' | 'POST', path: string, params: [string, string][] = [], body?: Uint8Array): HttpRequest {
    if (!path.startsWith('/') || path.includes('?')) {
      throw new Error('Invalid path format');
    }
    const query = params.map(([k, v]) => `${RemoteApi.encode(k)}=${RemoteApi.encode(v)}`).join('&');
    const target = `${path}${query ? `?${query}` : ''}`;
    const headers: Record<string, string> = {};
    if (this.pin) {
      headers[RemoteApi.PIN_HEADER] = this.pin;
    }
    if (body) {
      headers['Content-Type'] = 'audio/x-mpegurl';
      headers['Content-Length'] = String(body.length);
    }
    return { method, target, headers, body };
  }

  private ensureSuccess(response: HttpResponse): void {
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new RemoteApiException(response.statusCode, response.text());
    }
  }
}
