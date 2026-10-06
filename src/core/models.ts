/**
 * Core domain models for Compás Remote.
 * Reflects the Remote Control API v1 specification and native app state models.
 */

export interface Capabilities {
  version: number;
  transports: string[];
  features: string[];
}

export interface PlaybackStatus {
  playing: boolean;
  paused: boolean;
  title: string;
  artist: string;
  album: string;
  positionSeconds: number;
  durationSeconds: number;
  volume: number; // 0.0 to 1.0
  playMode: number; // 0: sequential, 1: repeat all, 2: repeat one, 3: shuffle
  codec?: string;
  sourceBitDepth?: number;
  sourceSampleRateHz?: number;
  bluetoothAudioOutput?: boolean | null;
}

export interface Song {
  index: number;
  title: string;
  artist: string;
  album?: string;
  offset?: number | null;
  albumArtist?: string;
  genre?: string;
  trackNumber?: number | null;
  discNumber?: number | null;
  albumKey?: string | null;
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
  name: string;
  count: number;
  index: number;
  albumArtist?: string;
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
  contentType: string | null;
  bytes: Uint8Array;
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

export enum PlaybackMode {
  Sequential = 0,
  RepeatAll = 1,
  RepeatOne = 2,
  Shuffle = 3,
}

export type ConnectionTransport = 'wifi' | 'bluetooth';
export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error';
export type ContentStatus = 'ready' | 'loading' | 'empty' | 'error';

export enum LibraryCategory {
  Albums = 'Albums',
  Artists = 'Artists',
  Songs = 'Tracks',
  Playlists = 'Playlists',
  Genres = 'Genres',
  AlbumArtists = 'Album Artists',
}
