import { isLibrarySortMode, isLibrarySortScope, LIBRARY_SORT_SECTIONS } from './librarySortModes';
import type { LibrarySortingSnapshot, LibrarySortScope, LibrarySortMode, LibrarySortSnapshot, LibraryGroup } from './types';
import { REMOTE_API_PREFIX, assertIntegerArgument, type RemoteApiRequests } from './remoteApiProtocol';

export class LibrarySortingApi {
  constructor(private readonly requests: Pick<RemoteApiRequests, 'jsonGet' | 'command'>) {}

  async librarySorting(): Promise<LibrarySortingSnapshot> {
    const json = await this.requests.jsonGet(`${REMOTE_API_PREFIX}/library/sorting`);
    const parse = (scope: LibrarySortScope): LibrarySortSnapshot => {
      const { configured, effective, available, reverse } = json?.[scope] ?? {};
      const { slots } = LIBRARY_SORT_SECTIONS[scope];
      if (!Array.isArray(available) || !slots.some((count) => count === available.length) ||
        available.some((slot) => typeof slot !== 'boolean') ||
        !isLibrarySortMode(scope, configured, available.length) ||
        !isLibrarySortMode(scope, effective, available.length) ||
        (reverse !== undefined && typeof reverse !== 'boolean')) {
        throw new Error('Invalid library sorting response');
      }
      return { configured, effective, available, reverse: reverse === true };
    };
    return { albums: parse('albums'), artists: parse('artists'), albumArtists: parse('album_artists') };
  }

  async setLibrarySorting(scope: LibrarySortScope, mode: LibrarySortMode): Promise<void> {
    if (!isLibrarySortScope(scope)) throw new Error('Invalid sorting scope');
    if (!isLibrarySortMode(scope, mode)) throw new Error('Invalid sort mode for scope');
    await this.requests.command('/library/sorting', [['scope', scope], ['mode', String(mode)]]);
  }

  async libraryAlbumGroups(options: { scope: LibrarySortScope; artist?: string | null; albumArtist?: string | null; offset?: number; limit?: number }): Promise<{ total: number; offset: number; nextOffset: number; revision: string; groups: LibraryGroup[] }> {
    assertIntegerArgument(options.offset ?? 0, 'Offset', 0);
    assertIntegerArgument(options.limit ?? 100, 'Limit', 1, 100);
    const params: [string, string][] = [['scope', options.scope], ['offset', String(options.offset ?? 0)], ['limit', String(options.limit ?? 100)]];
    if (options.artist != null) params.push(['artist', options.artist]);
    if (options.albumArtist != null) params.push(['album_artist', options.albumArtist]);
    const json = await this.requests.jsonGet(`${REMOTE_API_PREFIX}/library/albums`, params);
    if (![json.total, json.offset, json.next_offset].every((v) => Number.isSafeInteger(v) && v >= 0) || !Array.isArray(json.groups) || typeof json.revision !== 'string' || !json.revision) throw new Error('Invalid album page');
    return { total: json.total, offset: json.offset, nextOffset: json.next_offset, revision: json.revision, groups: json.groups.map((g: any) => ({
      name: String(g.name || ''), count: Number(g.count || 0), index: Number(g.index || 0),
      albumArtist: String(g.album_artist || ''), albumKey: typeof g.album_key === 'string' ? g.album_key : null,
    })) };
  }
}
