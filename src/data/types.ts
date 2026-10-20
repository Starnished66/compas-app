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

export type LibrarySortScope = 'albums' | 'artists' | 'album_artists';
export type LibrarySortMode = 0 | 1 | 2;
export interface LibrarySortSnapshot {
  configured: LibrarySortMode;
  effective: LibrarySortMode;
  available: readonly [boolean, boolean, boolean];
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
  accentColor?: string | null;
  deviceModel?: string | null;
  playerVersion?: string | null;
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

export type RemoteScreen =
  | { type: 'Home' }
  | { type: 'Library'; category: LibraryCategory }
  | { type: 'Queue' }
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
  codec?: string | null;
  sourceBitDepth?: number | null;
  sourceSampleRateHz?: number | null;
  queueOffset?: number;
}

export interface LibraryEntry {
  id: string;
  title: string;
  subtitle: string;
  subtitleTranslation?: { source: string; values?: Record<string, string | number> };
  artwork?: string | null;
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
  currentFavorite: boolean;
  supportedFeatures: string[];
  playerAccentColor?: string | null;
  deviceModel?: string | null;
  playerVersion?: string | null;
  queue: RemoteTrack[];
  queueTotal: number;
  queueHasMore: boolean;
  queueLoadingMore: boolean;
  libraryEntries: LibraryEntry[];
  catalogSyncMessage?: string | null;
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
  songActionFavorite: boolean | null;
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

export type RemoteAction =
  | { type: 'SetLibrarySorting'; scope: LibrarySortScope; mode: LibrarySortMode }
  | { type: 'PlayCollection'; shuffle: boolean }
  | { type: 'SetTheme'; theme: RemoteTheme }
  | { type: 'OpenHome' }
  | { type: 'OpenConnection' }
  | { type: 'StartAutoReconnect' }
  | { type: 'Connect' }
  | { type: 'Disconnect' }
  | { type: 'RetryConnection' }
  | { type: 'SetPinInput'; value: string }
  | { type: 'SubmitPin' }
  | { type: 'DismissPin' }
  | { type: 'ChangePin' }
  | { type: 'SetWifiAddress'; address: string }
  | { type: 'SelectWifiPlayer'; id: string }
  | { type: 'RetryWifiDiscovery' }
  | { type: 'SelectConnectionTransport'; transport: ConnectionTransport }
  | { type: 'ScanBluetoothPlayers' }
  | { type: 'SelectBluetoothPlayer'; id: string }
  | { type: 'PairBluetoothPlayer'; id: string }
  | { type: 'Back' }
  | { type: 'OpenLibrary'; category: LibraryCategory }
  | { type: 'RefreshLibrary'; category: LibraryCategory }
  | { type: 'SyncLibrary' }
  | { type: 'OpenQueue' }
  | { type: 'TogglePlayback' }
  | { type: 'Play' }
  | { type: 'Pause' }
  | { type: 'SetPlaying'; playing: boolean }
  | { type: 'Previous' }
  | { type: 'Next' }
  | { type: 'CyclePlaybackMode' }
  | { type: 'ToggleShuffle' }
  | { type: 'CycleRepeatMode' }
  | { type: 'SeekTo'; positionMs: number }
  | { type: 'SetVolume'; volume: number }
  | { type: 'SearchLibrary'; query: string }
  | { type: 'LoadMoreLibrary' }
  | { type: 'LoadMoreQueue' }
  | { type: 'LoadLibraryArtwork'; entryId: string }
  | { type: 'SelectLibraryEntry'; id: string }
  | { type: 'RemoveQueueTrack'; id: string }
  | { type: 'OpenSongActions'; id: string }
  | { type: 'LoadSongPlaylists' }
  | { type: 'CloseSongActions' }
  | { type: 'AddSongToQueue' }
  | { type: 'AddSongToPlaylist'; key: string }
  | { type: 'CreatePlaylistWithSong'; name: string }
  | { type: 'ClearQueue' }
  | { type: 'MoveQueueTrack'; id: string; direction: -1 | 1 }
  | { type: 'PlayQueueTrack'; id: string }
  | { type: 'SetCurrentFavorite'; favorite: boolean }
  | { type: 'SetSongFavorite'; favorite: boolean }
  | { type: 'CreateEmptyPlaylist'; name: string }
  | { type: 'RenamePlaylist'; key: string; name: string }
  | { type: 'DeletePlaylist'; key: string }
  | { type: 'RemovePlaylistTrack' }
  | { type: 'MovePlaylistTrack'; direction: -1 | 1 }
  | { type: 'ImportPlaylist'; name: string }
  | { type: 'LoadBulkPlaylists' }
  | { type: 'RunBulkAction'; ids: string[]; action: 'queue' | 'random' | 'favorite' | 'playlist' | 'createPlaylist'; favorite?: boolean; key?: string; name?: string }
  | { type: 'CancelBulkAction' }
  | { type: 'RemoveQueueTracks'; ids: string[] };
