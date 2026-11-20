import type { SessionState } from './useSessionRefs';
import { type ActionOf } from './remoteActionDispatch';
import { RemoteTrack } from '../data/types';
import type { LibraryEntry } from '../data/types';

interface LibraryEditActionsDependencies {
  shared: Pick<SessionState,
    'apiRef' | 'bulkSelectionsRef' | 'libraryEntriesRef'
  >;
  cancelBulkAction: () => void;
  closeSongActions: () => void;
  createEmptyPlaylist: (name: string) => Promise<void>;
  editPlaylist: (key: string, name?: string | undefined) => Promise<void>;
  editPlaylistTrack: (direction?: 1 | -1 | undefined) => Promise<void>;
  importPlaylist: (name: string) => Promise<void>;
  libraryRow: (id: string) => LibraryEntry | undefined;
  loadBulkPlaylists: () => Promise<void>;
  loadSongPlaylists: () => Promise<void>;
  openSongActions: (id: string) => void;
  ownsCurrentPlayer: () => () => boolean;
  runBulkAction: (action: ActionOf<'RunBulkAction'>) => Promise<void>;
  runSongAction: (kind: "queue" | "playlist" | "create", value?: string | undefined) => Promise<void>;
  setTrackRating: (rating: number, current: boolean, reportError?: boolean, track?: RemoteTrack | null, signal?: AbortSignal | undefined, confirm?: (() => boolean) | undefined, expired?: (() => boolean) | undefined) => Promise<{ rating: number; error?: undefined; } | { error: string; rating?: undefined; } | undefined>;
  swipeSong: (id: string, kind: "queue" | "next") => Promise<void>;
}

const handleOpenSongActions = (deps: LibraryEditActionsDependencies, action: ActionOf<'OpenSongActions'>) => {
  const { openSongActions } = deps;
  openSongActions(action.id);
};

const handleLoadSongPlaylists = (deps: LibraryEditActionsDependencies) => {
  const { loadSongPlaylists } = deps;
  loadSongPlaylists();
};

const handleCloseSongActions = (deps: LibraryEditActionsDependencies) => {
  const { closeSongActions } = deps;
  closeSongActions();
};

const handleAddSongToQueue = (deps: LibraryEditActionsDependencies) => {
  const { runSongAction } = deps;
  runSongAction('queue');
};

const handleSwipeSongAction = (deps: LibraryEditActionsDependencies, action: ActionOf<'SwipeSongAction'>) => {
  const { swipeSong } = deps;
  swipeSong(action.id, action.action);
};

const handleAddSongToPlaylist = (deps: LibraryEditActionsDependencies, action: ActionOf<'AddSongToPlaylist'>) => {
  const { runSongAction } = deps;
  runSongAction('playlist', action.key);
};

const handleCreatePlaylistWithSong = (deps: LibraryEditActionsDependencies, action: ActionOf<'CreatePlaylistWithSong'>) => {
  const { runSongAction } = deps;
  runSongAction('create', action.name);
};

const handleSetSongRating = (deps: LibraryEditActionsDependencies, action: ActionOf<'SetSongRating'>) => {
  const { setTrackRating } = deps;
  setTrackRating(action.rating, false);
};

const handleCreateEmptyPlaylist = (deps: LibraryEditActionsDependencies, action: ActionOf<'CreateEmptyPlaylist'>) => {
  const { createEmptyPlaylist } = deps;
  createEmptyPlaylist(action.name);
};

const handleRenamePlaylist = (deps: LibraryEditActionsDependencies, action: ActionOf<'RenamePlaylist'>) => {
  const { editPlaylist } = deps;
  editPlaylist(action.key, action.name);
};

const handleDeletePlaylist = (deps: LibraryEditActionsDependencies, action: ActionOf<'DeletePlaylist'>) => {
  const { editPlaylist } = deps;
  editPlaylist(action.key);
};

const handleRemovePlaylistTrack = (deps: LibraryEditActionsDependencies) => {
  const { editPlaylistTrack } = deps;
  editPlaylistTrack();
};

const handleMovePlaylistTrack = (deps: LibraryEditActionsDependencies, action: ActionOf<'MovePlaylistTrack'>) => {
  const { editPlaylistTrack } = deps;
  editPlaylistTrack(action.direction);
};

const handleImportPlaylist = (deps: LibraryEditActionsDependencies, action: ActionOf<'ImportPlaylist'>) => {
  const { importPlaylist } = deps;
  importPlaylist(action.name);
};

const handleLoadBulkPlaylists = (deps: LibraryEditActionsDependencies) => {
  const { loadBulkPlaylists } = deps;
  loadBulkPlaylists();
};

const handleCaptureBulkSelection = (deps: LibraryEditActionsDependencies, action: ActionOf<'CaptureBulkSelection'>) => {
  const { shared: { apiRef, bulkSelectionsRef, libraryEntriesRef }, libraryRow, ownsCurrentPlayer } = deps;
  const targets = action.ids.map((id) => libraryEntriesRef.current.currentTarget(libraryRow(id)));
  const ownsPlayer = ownsCurrentPlayer(), selections = bulkSelectionsRef.current;
  if (apiRef.current && targets.every((target) => target !== undefined)) {
    selections.set(action.ids, { targets, ownsSource: () => ownsPlayer() && selections === bulkSelectionsRef.current });
  }
};

const handleReleaseBulkSelection = (deps: LibraryEditActionsDependencies, action: ActionOf<'ReleaseBulkSelection'>) => {
  const { bulkSelectionsRef } = deps.shared;
  bulkSelectionsRef.current.delete(action.ids);
};

const handleRunBulkAction = (deps: LibraryEditActionsDependencies, action: ActionOf<'RunBulkAction'>) => {
  const { runBulkAction } = deps;
  runBulkAction(action);
};

const handleCancelBulkAction = (deps: LibraryEditActionsDependencies) => {
  const { cancelBulkAction } = deps;
  cancelBulkAction();
};

export function createLibraryEditActions(deps: LibraryEditActionsDependencies) {
  return {
    libraryEditActions: {
      OpenSongActions: handleOpenSongActions.bind(undefined, deps),
      LoadSongPlaylists: handleLoadSongPlaylists.bind(undefined, deps),
      CloseSongActions: handleCloseSongActions.bind(undefined, deps),
      AddSongToQueue: handleAddSongToQueue.bind(undefined, deps),
      SwipeSongAction: handleSwipeSongAction.bind(undefined, deps),
      AddSongToPlaylist: handleAddSongToPlaylist.bind(undefined, deps),
      CreatePlaylistWithSong: handleCreatePlaylistWithSong.bind(undefined, deps),
      SetSongRating: handleSetSongRating.bind(undefined, deps),
      CreateEmptyPlaylist: handleCreateEmptyPlaylist.bind(undefined, deps),
      RenamePlaylist: handleRenamePlaylist.bind(undefined, deps),
      DeletePlaylist: handleDeletePlaylist.bind(undefined, deps),
      RemovePlaylistTrack: handleRemovePlaylistTrack.bind(undefined, deps),
      MovePlaylistTrack: handleMovePlaylistTrack.bind(undefined, deps),
      ImportPlaylist: handleImportPlaylist.bind(undefined, deps),
      LoadBulkPlaylists: handleLoadBulkPlaylists.bind(undefined, deps),
      CaptureBulkSelection: handleCaptureBulkSelection.bind(undefined, deps),
      ReleaseBulkSelection: handleReleaseBulkSelection.bind(undefined, deps),
      RunBulkAction: handleRunBulkAction.bind(undefined, deps),
      CancelBulkAction: handleCancelBulkAction.bind(undefined, deps),
    },
  };
}
