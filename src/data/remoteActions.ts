import type { LibrarySortMode, LibrarySortScope } from './librarySortModes';
import type { ConnectionTransport, LibraryCategory, RemoteTheme, RemoteTrack } from './remoteUiState';

export type RatingWriteResult = { rating: number } | { error: string };

interface CurrentRatingEdit {
  expectedTrack?: RemoteTrack;
  onSettled?: (result: RatingWriteResult) => void;
}

export type RemoteAction =
  | { type: 'SetLibrarySorting'; scope: LibrarySortScope; mode: LibrarySortMode }
  | { type: 'PlayCollection'; shuffle: boolean }
  | { type: 'SetTheme'; theme: RemoteTheme }
  | { type: 'OpenHome' }
  | { type: 'OpenTransfer' }
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
  | { type: 'RetryQueueArtwork'; ids: string[] }
  | { type: 'LoadLibraryArtwork'; entryId: string }
  | { type: 'SelectLibraryEntry'; id: string }
  | { type: 'RemoveQueueTrack'; id: string }
  | { type: 'OpenSongActions'; id: string }
  | { type: 'LoadSongPlaylists' }
  | { type: 'CloseSongActions' }
  | { type: 'AddSongToQueue' }
  | { type: 'SwipeSongAction'; id: string; action: 'queue' | 'next' }
  | { type: 'AddSongToPlaylist'; key: string }
  | { type: 'CreatePlaylistWithSong'; name: string }
  | { type: 'ClearQueue' }
  | { type: 'MoveQueueTrack'; id: string; direction: -1 | 1 }
  | { type: 'PlayQueueTrack'; id: string }
  | ({ type: 'SetCurrentFavorite'; favorite: boolean } & CurrentRatingEdit)
  | ({ type: 'SetCurrentRating'; rating: number } & CurrentRatingEdit)
  | { type: 'SetSongRating'; rating: number }
  | { type: 'CreateEmptyPlaylist'; name: string }
  | { type: 'RenamePlaylist'; key: string; name: string }
  | { type: 'DeletePlaylist'; key: string }
  | { type: 'RemovePlaylistTrack' }
  | { type: 'MovePlaylistTrack'; direction: -1 | 1 }
  | { type: 'ImportPlaylist'; name: string }
  | { type: 'LoadBulkPlaylists' }
  | { type: 'CaptureBulkSelection' | 'ReleaseBulkSelection'; ids: string[] }
  | { type: 'RunBulkAction'; ids: string[]; action: 'queue' | 'random' | 'favorite' | 'playlist' | 'createPlaylist'; favorite?: boolean; key?: string; name?: string }
  | { type: 'CancelBulkAction' }
  | { type: 'RemoveQueueTracks'; ids: string[] };
