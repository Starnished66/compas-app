import type {
  ArtImage,
  CatalogCoversPage,
  CatalogPage,
  LibraryFilter,
  LibraryGroup,
  LibraryPage,
  FolderPage,
  PlaylistPage,
  PlayContext,
  Playlist,
  QueuePage,
  Song,
  LibrarySortScope,
  LibrarySortMode,
  LibrarySortingSnapshot,
  CollectionPlayRequest,
  WifiImportStatus,
  WifiImportDirectoryPage,
  WifiImportUploadResult,
} from './types';
import type { NativeUploadProgress } from './nativeFileUpload';
import { assertIntegerArgument, RemoteApiException } from './remoteApiProtocol';
import { RemoteApiConnection } from './RemoteApiConnection';
import { WifiImportApi } from './WifiImportApi';
import { LibrarySortingApi } from './LibrarySortingApi';
import { PlaylistApi, readPlaylistSongs, validatePlaylistName } from './PlaylistApi';
import { CatalogApi } from './CatalogApi';
import { SongStateApi } from './SongStateApi';

export { RemoteApiException } from './remoteApiProtocol';

export class RemoteApi extends RemoteApiConnection {
  private readonly wifiImportApi = new WifiImportApi(this.requests);

  importStatus(): Promise<WifiImportStatus> {
    return this.wifiImportApi.importStatus();
  }

  startImport(): Promise<void> {
    return this.wifiImportApi.startImport();
  }

  stopImport(): Promise<void> {
    return this.wifiImportApi.stopImport();
  }

  importFiles(path?: string, offset?: number, limit?: number, showHidden?: boolean): Promise<WifiImportDirectoryPage> {
    return this.wifiImportApi.importFiles(path, offset, limit, showHidden);
  }

  uploadImportFile(
    endpoint: string,
    fileUri: string,
    path: string,
    name: string,
    onProgress: (progress: NativeUploadProgress) => void,
    signal?: AbortSignal,
  ): Promise<WifiImportUploadResult> {
    return this.wifiImportApi.uploadImportFile(endpoint, fileUri, path, name, onProgress, signal);
  }

  renameImportFile(path: string, name: string): Promise<void> {
    return this.wifiImportApi.renameImportFile(path, name);
  }

  deleteImportFile(path: string): Promise<void> {
    return this.wifiImportApi.deleteImportFile(path);
  }

  createImportDirectory(path: string, name: string): Promise<void> {
    return this.wifiImportApi.createImportDirectory(path, name);
  }

  private readonly librarySortingApi = new LibrarySortingApi(this.requests);

  librarySorting(): Promise<LibrarySortingSnapshot> {
    return this.librarySortingApi.librarySorting();
  }

  setLibrarySorting(scope: LibrarySortScope, mode: LibrarySortMode): Promise<void> {
    return this.librarySortingApi.setLibrarySorting(scope, mode);
  }

  libraryAlbumGroups(options: { scope: LibrarySortScope; artist?: string | null; albumArtist?: string | null; offset?: number; limit?: number }): Promise<{ total: number; offset: number; nextOffset: number; revision: string; groups: LibraryGroup[] }> {
    return this.librarySortingApi.libraryAlbumGroups(options);
  }

  private readonly playlistApi = new PlaylistApi(this.requests);

  playlists(): Promise<Playlist[]> {
    return this.playlistApi.playlists();
  }

  playlistPage(key: string, offset?: number): Promise<PlaylistPage> {
    return this.playlistApi.playlistPage(key, offset);
  }

  createEmptyPlaylist(name: string): Promise<void> {
    return this.playlistApi.createEmptyPlaylist(name);
  }

  renamePlaylist(key: string, newName: string): Promise<string> {
    return this.playlistApi.renamePlaylist(key, newName);
  }

  deletePlaylist(key: string): Promise<void> {
    return this.playlistApi.deletePlaylist(key);
  }

  removePlaylistTrack(key: string, position: number, revision: string): Promise<string | null> {
    return this.playlistApi.removePlaylistTrack(key, position, revision);
  }

  movePlaylistTrack(key: string, from: number, to: number, revision: string): Promise<string | null> {
    return this.playlistApi.movePlaylistTrack(key, from, to, revision);
  }

  importPlaylist(name: string, body: Uint8Array): Promise<{ entries: number; matched: number }> {
    return this.playlistApi.importPlaylist(name, body);
  }

  createPlaylist(name: string, index: number): Promise<void> {
    return this.playlistApi.createPlaylist(name, index);
  }

  addToPlaylist(name: string, index: number): Promise<void> {
    return this.playlistApi.addToPlaylist(name, index);
  }

  private readonly catalogApi = new CatalogApi(this.requests);

  library(
    offset?: number,
    limit?: number,
    query?: string | null,
    filter?: LibraryFilter,
    signal?: AbortSignal,
  ): Promise<LibraryPage> {
    return this.catalogApi.library(offset, limit, query, filter, signal);
  }

  catalog(
    offset?: number,
    limit?: number,
    revision?: string | null
  ): Promise<CatalogPage> {
    return this.catalogApi.catalog(offset, limit, revision);
  }

  catalogCovers(
    offset?: number,
    limit?: number,
    revision?: string
  ): Promise<CatalogCoversPage> {
    return this.catalogApi.catalogCovers(offset, limit, revision);
  }

  catalogArt(revision: string, representativeId: number, coverKey: string): Promise<ArtImage | null> {
    return this.catalogApi.catalogArt(revision, representativeId, coverKey);
  }

  downloadCatalogArt(fileUri: string, revision: string, representativeId: number, coverKey: string): Promise<boolean> {
    return this.catalogApi.downloadCatalogArt(fileUri, revision, representativeId, coverKey);
  }

  artists(signal?: AbortSignal): Promise<LibraryGroup[]> {
    return this.catalogApi.artists(signal);
  }

  albumArtists(): Promise<LibraryGroup[]> {
    return this.catalogApi.albumArtists();
  }

  genres(signal?: AbortSignal): Promise<LibraryGroup[]> {
    return this.catalogApi.genres(signal);
  }

  albums(filter?: LibraryFilter, signal?: AbortSignal): Promise<LibraryGroup[]> {
    return this.catalogApi.albums(filter, signal);
  }

  topRatedAlbums(): Promise<LibraryGroup[]> {
    return this.catalogApi.topRatedAlbums();
  }

  folderRoots(): Promise<Array<{ id: string; name: string; available: boolean }>> {
    return this.catalogApi.folderRoots();
  }

  folder(path?: string, offset?: number, root?: string): Promise<FolderPage> {
    return this.catalogApi.folder(path, offset, root);
  }

  playFolderTrack(path: string, root?: string): Promise<void> {
    return this.catalogApi.playFolderTrack(path, root);
  }

  recent(offset?: number): Promise<{ songs: Song[]; total: number; nextOffset: number }> {
    return this.catalogApi.recent(offset);
  }

  private readonly songStateApi = new SongStateApi(this.requests);

  favoriteStates(ids: number[]): Promise<Map<number, boolean>> {
    return this.songStateApi.favoriteStates(ids);
  }

  ratingStates(ids: number[]): Promise<Map<number, number>> {
    return this.songStateApi.ratingStates(ids);
  }

  setFavorite(favorite: boolean, index?: number, catalogRevision?: string | null, signal?: AbortSignal): Promise<boolean> {
    return this.songStateApi.setFavorite(favorite, index, catalogRevision, signal);
  }

  setRating(index: number | undefined, stars: number, catalogRevision?: string | null, signal?: AbortSignal): Promise<number> {
    return this.songStateApi.setRating(index, stars, catalogRevision, signal);
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
    assertIntegerArgument(mode, 'Play mode', 0, 4);
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

  async playCollection(request: CollectionPlayRequest): Promise<number> {
    assertIntegerArgument(request.mode, 'Play mode', 0, 4);
    const params: [string, string][] = [['scope', request.scope], ['mode', String(request.mode)]];
    if (request.name != null) params.push(['name', request.name]);
    if (request.artist != null) params.push(['artist', request.artist]);
    if (request.albumArtist != null) params.push(['album_artist', request.albumArtist]);
    if (request.catalogRevision) params.push(['catalog_revision', request.catalogRevision]);
    const response = await this.sendPlayerCommand('/playback/collection', params);
    if (response.statusCode < 200 || response.statusCode >= 300) throw new RemoteApiException(response.statusCode, response.text());
    const json = JSON.parse(response.text());
    if (!Number.isSafeInteger(json.id) || json.id < 1) throw new Error('Invalid collection job');
    return json.id;
  }

  playlistSongs(key: string): Promise<Song[]> {
    return readPlaylistSongs((name, offset) => this.playlistPage(name, offset), key);
  }

  static validatePlaylistName(name: string): void {
    validatePlaylistName(name);
  }
}
