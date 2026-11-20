import type { Playlist, PlaylistPage, Song } from './types';
import { REMOTE_API_PREFIX, jsonBoolean, assertIntegerArgument, type RemoteApiRequests } from './remoteApiProtocol';

export function validatePlaylistName(name: string): void {
  const bytes = new TextEncoder().encode(name).length;
  if (bytes < 1 || bytes > 127 || name.startsWith('.') || name.startsWith('@') ||
      /[\x00-\x1f\x7f/\\:*?"<>|]/.test(name) || name.includes('..') ||
      /[ .]$/.test(name) || /\.m3u8?$/i.test(name) ||
      /^(Favorites|Most Played)$/i.test(name)) {
    throw new Error('Invalid playlist name. Use 1–127 UTF-8 bytes without reserved characters or an M3U extension.');
  }
}

export class PlaylistApi {
  constructor(private readonly requests: Pick<RemoteApiRequests, 'jsonGet' | 'command' | 'send' | 'ensureSuccess'>) {}

  async playlists(): Promise<Playlist[]> {
    const json = await this.requests.jsonGet(`${REMOTE_API_PREFIX}/playlists`);
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

  async playlistPage(key: string, offset: number = 0): Promise<PlaylistPage> {
    assertIntegerArgument(offset, 'Offset', 0);
    const json = await this.requests.jsonGet(`${REMOTE_API_PREFIX}/playlists/songs`, [['name', key], ['offset', String(offset)]]);
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
    validatePlaylistName(name);
    await this.requests.command('/playlists/create', [['name', name]]);
  }

  async renamePlaylist(key: string, newName: string): Promise<string> {
    validatePlaylistName(newName);
    const res = await this.requests.send('POST', `${REMOTE_API_PREFIX}/playlists/rename`, [['name', key], ['new_name', newName]]);
    this.requests.ensureSuccess(res);
    return String(JSON.parse(res.text()).key || newName);
  }

  async deletePlaylist(key: string): Promise<void> {
    await this.requests.command('/playlists/delete', [['name', key]]);
  }

  async removePlaylistTrack(key: string, position: number, revision: string): Promise<string | null> {
    assertIntegerArgument(position, 'Position', 0);
    const res = await this.requests.send('POST', `${REMOTE_API_PREFIX}/playlists/remove`, [
      ['name', key], ['position', String(position)], ['revision', revision],
    ]);
    this.requests.ensureSuccess(res);
    return JSON.parse(res.text()).revision ?? null;
  }

  async movePlaylistTrack(key: string, from: number, to: number, revision: string): Promise<string | null> {
    assertIntegerArgument(from, 'From', 0);
    assertIntegerArgument(to, 'To', 0);
    const res = await this.requests.send('POST', `${REMOTE_API_PREFIX}/playlists/move`, [
      ['name', key], ['from', String(from)], ['to', String(to)], ['revision', revision],
    ]);
    this.requests.ensureSuccess(res);
    return JSON.parse(res.text()).revision ?? null;
  }

  async importPlaylist(name: string, body: Uint8Array): Promise<{ entries: number; matched: number }> {
    validatePlaylistName(name);
    if (!body.length || body.length > 256 * 1024) throw new Error('Playlist file must be 1–256 KiB');
    const res = await this.requests.send('POST', `${REMOTE_API_PREFIX}/playlists/import`, [['name', name]], body);
    this.requests.ensureSuccess(res);
    const json = JSON.parse(res.text());
    return { entries: Number(json.entries || 0), matched: Number(json.matched || 0) };
  }

  async createPlaylist(name: string, index: number): Promise<void> {
    validatePlaylistName(name);
    assertIntegerArgument(index, 'Index', 0);
    await this.requests.command('/playlists', [
      ['name', name],
      ['index', index.toString()],
    ]);
  }

  async addToPlaylist(name: string, index: number): Promise<void> {
    validatePlaylistName(name);
    assertIntegerArgument(index, 'Index', 0);
    await this.requests.command('/playlists/add', [
      ['name', name],
      ['index', index.toString()],
    ]);
  }
}

export async function readPlaylistSongs(readPage: PlaylistApi['playlistPage'], key: string): Promise<Song[]> {
  const first = await readPage(key);
  const songs = [...first.songs];
  let nextOffset = first.nextOffset;
  while (nextOffset > 0 && nextOffset < first.total) {
    const page = await readPage(key, nextOffset);
    if (page.nextOffset <= nextOffset) break;
    songs.push(...page.songs);
    nextOffset = page.nextOffset;
  }
  return songs;
}
