import type { ArtworkReference } from './MemoryArtworkCache';
import type { DacMode } from './dacMode';
import type { LibrarySortingSnapshot, Playlist } from './remoteDtos';

export type RemoteScreen =
  | { type: 'Home' }
  | { type: 'Library'; category: LibraryCategory }
  | { type: 'Queue' }
  | { type: 'Transfer' }
  | { type: 'Connection' };

export enum LibraryCategory {
  Albums = 'Albums',
  Artists = 'Artists',
  Songs = 'Tracks',
  Playlists = 'Playlists',
  Genres = 'Genres',
  AlbumArtists = 'Album Artists',
  Search = 'Search',
  Folders = 'Folders',
  Recent = 'Recently Played',
  Favorites = 'Favorites',
}

export enum RemoteTheme {
  Dark = 'Dark',
  Light = 'Light',
  System = 'System',
}

export enum ConnectionStatus {
  Connected = 'Connected',
  Connecting = 'Connecting',
  Disconnected = 'Disconnected',
  Error = 'Error',
}

export enum ConnectionTransport {
  Wifi = 'Wifi',
  Bluetooth = 'Bluetooth',
}

export enum ContentStatus {
  Ready = 'Ready',
  Loading = 'Loading',
  Empty = 'Empty',
  Error = 'Error',
}

export enum PlaybackMode {
  Sequential = 'Sequential',
  RepeatAll = 'RepeatAll',
  RepeatOne = 'RepeatOne',
  Shuffle = 'Shuffle',
  ShuffleRepeat = 'ShuffleRepeat',
}

export interface RemoteTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: string;
  artwork?: string | null;
  artworkReference?: ArtworkReference;
  codec?: string | null;
  sourceBitDepth?: number | null;
  sourceSampleRateHz?: number | null;
  queueOffset?: number;
}

export interface LibraryEntry {
  stars?: number;
  id: string;
  title: string;
  subtitle: string;
  subtitleTranslation?: { source: string; values?: Record<string, string | number> };
  artwork?: string | null;
  artworkReference?: ArtworkReference;
  kind?: 'song' | 'other';
  favorite?: boolean;
  playlistKey?: string;
  writable?: boolean;
  playlistPosition?: number | null;
}

export interface BluetoothPlayer {
  id: string;
  name: string;
  paired: boolean;
  bonding: boolean;
}

export interface WifiPlayer {
  id: string;
  name: string;
  address: string;
}

export interface RemoteUiState {
  dacMode?: DacMode;
  connectionAttemptTransport?: ConnectionTransport | null;
  collectionBusy?: boolean;
  librarySorting?: LibrarySortingSnapshot | null;
  screen: RemoteScreen;
  theme: RemoteTheme;
  connectionStatus: ConnectionStatus;
  connectionTransport: ConnectionTransport;
  selectedConnectionTransport: ConnectionTransport;
  wifiAddress: string;
  wifiPlayers: WifiPlayer[];
  wifiDiscoveryStatus: ContentStatus;
  bluetoothPlayers: BluetoothPlayer[];
  selectedBluetoothPlayerId?: string | null;
  bluetoothScanStatus: ContentStatus;
  playerName: string;
  connectionMessage?: string | null;
  pinDialogVisible: boolean;
  pinInput: string;
  pinError?: string | null;
  pinRetryDelaySeconds: number;
  currentTrack?: RemoteTrack | null;
  isPlaying: boolean;
  bluetoothArtworkRefreshGeneration: number;
  catalogArtworkRefreshGeneration: number;
  volume: number;
  playbackMode: PlaybackMode;
  currentRating: number;
  pendingCurrentRating?: { track: RemoteTrack; rating: number };
  supportedFeatures: string[];
  playerAccentColor?: string | null;
  deviceModel?: string | null;
  playerVersion?: string | null;
  /** Change counter and boot id of the player's settings, from the status poll (settings_v1). */
  settingsRevision?: number | null;
  settingsEpoch?: number | null;
  queue: RemoteTrack[];
  queueTotal: number;
  queueHasMore: boolean;
  queueLoadingMore: boolean;
  libraryEntries: LibraryEntry[];
  libraryStatus: ContentStatus;
  queueStatus: ContentStatus;
  libraryQuery: string;
  libraryCountLabel?: string | null;
  libraryHasMore: boolean;
  libraryIsNested: boolean;
  libraryNestedTitle?: string | null;
  songActionsVisible: boolean;
  songActionTitle: string;
  playlistOptions: Playlist[];
  playlistOptionsStatus: ContentStatus;
  songActionRating: number | null;
  songActionPosition: number | null;
  playlistTrackCount: number;
  activePlaylist?: Playlist | null;
  playlistRevision?: string | null;
  folderPath: string;
  folderRoot: string;
  bulkActionProgress?: BulkActionProgress | null;
  bulkPlaylistOptions?: Playlist[];
  bulkPlaylistOptionsStatus?: ContentStatus;
}

export interface BulkActionProgress {
  action: 'queue' | 'random' | 'favorite' | 'playlist' | 'createPlaylist' | 'queueRemove';
  completed: number;
  total: number;
  succeeded: number;
  failed: number;
  processed: number;
  phase: 'resolving' | 'writing' | 'done' | 'cancelled' | 'error';
  message?: string | null;
  messageValues?: Record<string, string | number>;
}
