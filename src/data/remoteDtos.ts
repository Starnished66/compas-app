import type { DacMode } from './dacMode';
import type { LibrarySortMode } from './librarySortModes';

export interface Capabilities {
  version: number;
  transports: string[];
  features: string[];
  libraryId?: string | null;
}

export type WifiImportState = 'stopped' | 'starting' | 'ready' | 'stopping' | 'error';
export interface WifiImportStatus {
  state: WifiImportState;
  error: string | null;
}

export interface WifiImportFileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
}

export interface WifiImportDirectoryPage {
  path: string;
  entries: WifiImportFileEntry[];
  offset: number;
  nextOffset: number | null;
  total: number;
}

export interface WifiImportUploadResult {
  ok: true;
  path: string;
  name: string;
  bytes: number;
}

export interface LibrarySortSnapshot {
  configured: LibrarySortMode;
  effective: LibrarySortMode;
  available: readonly boolean[];
  reverse?: boolean;
}
export interface LibrarySortingSnapshot {
  albums: LibrarySortSnapshot;
  artists: LibrarySortSnapshot;
  albumArtists: LibrarySortSnapshot;
}
export type CollectionScope = 'all' | 'album' | 'artist' | 'album_artist' | 'genre' | 'playlist' | 'favorites' | 'recently_added' | 'recently_played';
export interface CollectionPlayRequest {
  scope: CollectionScope;
  name?: string;
  artist?: string;
  albumArtist?: string;
  mode: number;
  catalogRevision?: string | null;
}
export interface CollectionJob {
  id: number;
  state: 'idle' | 'pending' | 'done' | 'error';
  error: string | null;
}

export interface PlaybackStatus {
  dacMode?: DacMode;
  playing: boolean;
  paused: boolean;
  title: string;
  artist: string;
  album: string;
  positionSeconds: number;
  durationSeconds: number;
  volume: number;
  playMode: number;
  codec?: string;
  sourceBitDepth?: number;
  sourceSampleRateHz?: number;
  bluetoothAudioOutput?: boolean | null;
  favorite?: boolean | null;
  rating?: number | null;
  accentColor?: string | null;
  deviceModel?: string | null;
  playerVersion?: string | null;
  settingsRevision?: number | null;
  settingsEpoch?: number | null;
  collectionJob?: CollectionJob | null;
}

export interface Song {
  index: number;
  title: string;
  artist: string;
  album: string;
  offset?: number | null;
  albumArtist?: string;
  genre?: string;
  trackNumber?: number | null;
  discNumber?: number | null;
  albumKey?: string | null;
  position?: number | null;
  lastPlayed?: number | null;
}

export interface FolderEntry {
  type: 'folder' | 'playlist' | 'track';
  name: string;
  index?: number;
  title?: string;
  artist?: string;
}

export interface FolderPage {
  root: string;
  path: string;
  parent: string | null;
  total: number;
  folderCount: number;
  offset: number;
  nextOffset: number;
  entries: FolderEntry[];
}

export interface PlaylistPage {
  songs: Song[];
  total: number;
  nextOffset: number;
  revision: string | null;
  writable: boolean;
}

export interface QueuePage {
  total: number;
  offset: number;
  revision: number;
  songs: Song[];
}

export interface LibraryPage {
  total: number;
  songs: Song[];
}

export interface LibraryGroup {
  stars?: number;
  name: string;
  count: number;
  index: number;
  albumArtist: string;
  albumKey?: string | null;
}

export interface CatalogSong {
  id: number;
  title: string;
  artist: string;
  album: string;
  albumArtist: string;
  genre: string;
  trackNumber: number | null;
  discNumber: number | null;
  albumKey: string | null;
  artists: string[];
}

export interface CatalogPage {
  libraryId: string;
  revision: string;
  total: number;
  offset: number;
  nextOffset: number;
  songs: CatalogSong[];
}

export interface CatalogCover {
  albumKey: string;
  representativeId: number;
  coverKey: string;
  available: boolean | null;
}

export interface CatalogCoversPage {
  libraryId: string;
  revision: string;
  total: number;
  offset: number;
  nextOffset: number;
  covers: CatalogCover[];
}

export interface Playlist {
  name: string;
  key: string;
  internal: boolean;
  writable: boolean;
}

export interface ArtImage {
  contentType?: string | null;
  base64: string;
}

export interface LibraryFilter {
  artist?: string | null;
  albumArtist?: string | null;
  album?: string | null;
  genre?: string | null;
}

export interface PlayContext {
  playlist?: string | null;
  artist?: string | null;
  albumArtist?: string | null;
  album?: string | null;
}
