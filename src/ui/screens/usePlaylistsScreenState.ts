import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { useI18n } from '../../i18n';
import { ConnectionStatus, LibraryCategory, type LibraryEntry, type Playlist, type RemoteUiState } from '../../data/types';
import { builtInPlaylistLabel } from '../library/libraryCategories';
import { opensCollection, type LibraryEntryKind } from '../library/libraryEntryKind';
import { entryItems, playlistTrackItems } from '../library/libraryItems';
import { playlistDisplayName } from '../playlistName';
import { usePlaylistTrackEdits, type PlaylistEditOutcome } from '../library/usePlaylistTrackEdits';
import { TOP_RATED_ALBUMS_ROW } from '../../session/libraryCategoryLoader';
import type { PlaylistsScreenProps } from './PlaylistsScreen';
import { useScrollToTopRequest } from '../chrome/useScrollToTopRequest';
import { useSongSwipe } from '../library/useSongSwipe';
import { useSnackbar } from '../snackbar/useSnackbar';
import { useAlbumGrid } from '../library/useAlbumGrid';
import { useCollectionTrail } from '../library/useCollectionTrail';
import { useLibraryLevels } from '../library/useLibraryLevels';
import { useLibraryListScroll } from '../library/useLibraryListScroll';
import { usePlaylistArtwork } from '../library/useFirstEntryArtwork';
import { useBackInterceptor } from '../useBackInterceptor';
import { useBulkSelection } from '../library/useBulkSelection';

const PLAYLISTS_ROOT_KEY = 'playlists';
const NO_ENTRIES: LibraryEntry[] = [];

type Translate = ReturnType<typeof useI18n>['t'];
type Action = PlaylistsScreenProps['onAction'];

export function usePlaylistSelection(state: RemoteUiState, onAction: Action) {
  const [newSheetVisible, setNewSheetVisible] = useState(false);
  const [optionsPlaylist, setOptionsPlaylist] = useState<Playlist | null>(null);
  const [editing, setEditing] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const bulkSelection = useBulkSelection(selectedIds, onAction);
  const bulkActionsOpen = bulkSelection.ids !== null;
  const exitSelection = useCallback(() => { setSelectionMode(false); setSelectedIds(new Set()); }, []);
  useBackInterceptor(editing || selectionMode, () => { if (editing) setEditing(false); else exitSelection(); });
  // A page load or refresh keeps the selection; only ids that vanished are dropped. Opening another
  // playlist exits selection (see the playlist?.key effect below).
  useEffect(() => {
    if (bulkActionsOpen || state.libraryEntries.length === 0) return;
    setSelectedIds((previous) => {
      if (previous.size === 0) return previous;
      const present = new Set(state.libraryEntries.map((entry) => entry.id));
      const kept = [...previous].filter((id) => present.has(id));
      return kept.length === previous.size ? previous : new Set(kept);
    });
  }, [state.libraryEntries, bulkActionsOpen]);
  return {
    newSheetVisible, setNewSheetVisible, optionsPlaylist, setOptionsPlaylist, editing, setEditing, selectionMode,
    setSelectionMode, selectedIds, setSelectedIds, bulkSelection, bulkActionsOpen, exitSelection,
  };
}

export type Selection = ReturnType<typeof usePlaylistSelection>;

export function usePlaylistBrowsing(state: RemoteUiState, onAction: Action, editing: boolean, t: Translate) {
  const rootNames = useRef<string[]>([]);
  const { tileWidth } = useAlbumGrid();
  const snackbar = useSnackbar();

  const nested = state.libraryIsNested;
  const playlist = nested ? state.activePlaylist ?? null : null;
  const playlistLabel = builtInPlaylistLabel(playlist?.key, state.supportedFeatures);
  const playlistName = playlistLabel ? t(playlistLabel) : playlist ? playlistDisplayName(playlist.name) : '';
  const nestedTitle = state.libraryNestedTitle;
  const ratedAlbums = nested && !playlist && nestedTitle === TOP_RATED_ALBUMS_ROW.title;
  const { current: collection, rememberOpening } = useCollectionTrail(state.libraryEntries, nested && !playlist);
  const album = nested && !playlist && nestedTitle === 'Tracks' && collection?.kind === 'album'
    ? collection.entry : null;
  const canEditPlaylists = state.supportedFeatures.includes('playlist_edit');
  const canImport = state.supportedFeatures.includes('playlist_import');
  const canEditTracks = Boolean(playlist?.writable && canEditPlaylists && state.playlistRevision);
  const editMode = editing && canEditTracks;
  // Swiping would fight the edit-mode drag handles and remove buttons.
  const songSwipe = useSongSwipe(onAction, state.connectionMessage, state.queueStatus, state.connectionStatus === ConnectionStatus.Connected && !editMode);

  const scroll = useLibraryListScroll();
  const { scrollToTop, restoreOffset } = scroll;
  const levels = useLibraryLevels({
    entries: state.libraryEntries,
    nested,
    rootKey: PLAYLISTS_ROOT_KEY,
    currentOffset: scroll.offset,
    onEnterLevel: (offset) => (offset ? restoreOffset(offset) : scrollToTop()),
  });

  return {
    rootNames, tileWidth, snackbar, nested, playlist, playlistName, nestedTitle, ratedAlbums,
    rememberOpening, album, canEditPlaylists, canImport, canEditTracks, editMode, songSwipe, scroll, levels,
  };
}

export type Browse = ReturnType<typeof usePlaylistBrowsing>;

export function usePlaylistEditing(
  state: RemoteUiState, onAction: Action, { editing, setEditing, exitSelection }: Selection, browse: Browse, t: Translate,
) {
  const { snackbar, playlistName, playlist } = browse;
  const announceEdit = useCallback(
    (outcome: PlaylistEditOutcome) =>
      snackbar.show({
        text: outcome.kind === 'removed' ? t('Removed from {name}', { name: playlistName }) : t('Moved “{title}”', { title: outcome.title }),
      }),
    [playlistName, snackbar, t],
  );
  const edits = usePlaylistTrackEdits(state, onAction, announceEdit);
  const tracks = playlist ? edits.entries : NO_ENTRIES;

  useEffect(() => setEditing(false), [playlist?.key]);
  useEffect(() => exitSelection(), [playlist?.key, state.libraryNestedTitle, exitSelection]);
  useEffect(() => {
    if (editing && playlist && !edits.busy && tracks.length === 0) setEditing(false);
  }, [editing, edits.busy, playlist, tracks.length]);
  return { edits, tracks };
}

export type Editing = ReturnType<typeof usePlaylistEditing>;

export function usePlaylistRows(state: RemoteUiState, browse: Browse, { tracks }: Editing, t: Translate) {
  const { rootNames, playlist, nested, ratedAlbums, nestedTitle, album } = browse;
  const playlistArtwork = usePlaylistArtwork(playlist?.key, state.libraryEntries);

  if (!nested) {
    rootNames.current = state.libraryEntries
      .filter((entry) => entry.id !== TOP_RATED_ALBUMS_ROW.id)
      .map((entry) => playlistDisplayName(entry.title));
  }

  const listedEntries = useMemo(() => {
    if (nested) return state.libraryEntries;
    return state.libraryEntries.map((entry) => {
      const label = builtInPlaylistLabel(entry.playlistKey, state.supportedFeatures);
      return label ? { ...entry, title: t(label) } : entry;
    });
  }, [nested, state.libraryEntries, t, state.supportedFeatures]);
  const showingPlaylist = playlist != null;
  const rowItems = useMemo(
    () =>
      showingPlaylist
        ? playlistTrackItems(tracks)
        : entryItems(listedEntries, {
            category: ratedAlbums ? LibraryCategory.Albums : LibraryCategory.Playlists,
            isNested: nested && !ratedAlbums,
            nestedTitle,
          }, Boolean(album)),
    [showingPlaylist, tracks, listedEntries, nested, nestedTitle, ratedAlbums, album],
  );

  return { rowItems, playlistArtwork };
}

export type PlaylistRows = ReturnType<typeof usePlaylistRows>;

export function usePlaylistNavigation(onAction: Action, browse: Browse, selection: Selection) {
  const { setEditing, setSelectedIds, setSelectionMode } = selection;
  const { nested, levels, rememberOpening } = browse;
  const { scrollToTop } = browse.scroll;
  const { rememberPush } = levels;
  useScrollToTopRequest('playlists', () => {
    setEditing(false);
    if (!nested) scrollToTop(true);
    else if (levels.depth === 1) onAction({ type: 'Back' });
    else onAction({ type: 'OpenLibrary', category: LibraryCategory.Playlists });
  });

  const openEntry = useCallback(
    (entry: LibraryEntry, kind: LibraryEntryKind) => {
      if (kind === 'album') rememberOpening({ entry, kind });
      if (opensCollection(kind)) rememberPush();
      onAction({ type: 'SelectLibraryEntry', id: entry.id });
    },
    [onAction, rememberOpening, rememberPush],
  );

  const longPressEntry = useCallback(
    (entry: LibraryEntry, kind: LibraryEntryKind) => {
      if (kind === 'song' || kind === 'playlist' || kind === 'album') {
        setSelectedIds(new Set([entry.id]));
        setSelectionMode(true);
      }
    },
    [],
  );
  const selectEntry = useCallback((entry: LibraryEntry) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(entry.id)) next.delete(entry.id);
      else next.add(entry.id);
      return next;
    });
  }, []);
  const beginTrackSelection = useCallback((entry: LibraryEntry) => {
    setSelectedIds(new Set([entry.id]));
    setSelectionMode(true);
  }, []);

  const playTrack = useCallback(
    (entry: LibraryEntry) => onAction({ type: 'SelectLibraryEntry', id: entry.id }),
    [onAction],
  );
  const showTrackActions = useCallback(
    (entry: LibraryEntry) => onAction({ type: 'OpenSongActions', id: entry.id }),
    [onAction],
  );

  return { openEntry, longPressEntry, selectEntry, beginTrackSelection, playTrack, showTrackActions };
}

export type PlaylistNavigation = ReturnType<typeof usePlaylistNavigation>;
