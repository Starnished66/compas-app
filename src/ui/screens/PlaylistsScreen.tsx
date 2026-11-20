import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../i18n';
import { StyleSheet, View } from 'react-native';
import {
  ConnectionStatus,
  LibraryCategory,
  LibraryEntry,
  Playlist,
  RemoteAction,
  RemoteUiState,
} from '../../data/types';
import { useScrollToTopRequest } from '../chrome/useScrollToTopRequest';
import { AlbumCollectionHeader } from '../components/AlbumCollectionHeader';
import { Button } from '../components/Button';
import { CollectionHeader } from '../components/CollectionHeader';
import { CollectionPlayButtons } from '../components/CollectionPlayButtons';
import { CrossfadeLayers } from '../components/CrossfadeLayers';
import { DragReorderCellContext } from '../components/dragReorderCellContext';
import { IconButton } from '../components/IconButton';
import { InlineError } from '../components/InlineError';
import { LibraryList } from '../components/LibraryList';
import { LibraryEntryRow } from '../components/LibraryEntryRow';
import { useSongSwipe } from '../library/useSongSwipe';
import { LibraryPlaceholder } from '../components/LibraryPlaceholder';
import { NewPlaylistRow } from '../components/NewPlaylistRow';
import { PageTransition } from '../components/PageTransition';
import { PlaylistEditBar } from '../components/PlaylistEditBar';
import { PlaylistTrackRow } from '../components/PlaylistTrackRow';
import { ScreenTitleBar } from '../components/ScreenTitleBar';
import { NewPlaylistSheet } from '../sheets/NewPlaylistSheet';
import { PlaylistOptionsSheet } from '../sheets/PlaylistOptionsSheet';
import { playlistDisplayName } from '../playlistName';
import { useSnackbar } from '../snackbar/useSnackbar';
import { Space } from '../tokens';
import { useDragReorder } from '../useDragReorder';
import { playCollection } from '../library/collectionPlayback';
import { isShuffleMode } from '../../session/playbackModes';
import { LibraryEntryKind, isCurrentEntry, opensCollection } from '../library/libraryEntryKind';
import { LibraryItem, entryItems, nodeItem, playlistTrackItems, songIds } from '../library/libraryItems';
import { inlineLibraryError, libraryStateMessage } from '../library/libraryStateMessage';
import { useAlbumGrid } from '../library/useAlbumGrid';
import { useCollectionTrail } from '../library/useCollectionTrail';
import { useLibraryLevels } from '../library/useLibraryLevels';
import { useLibraryListScroll } from '../library/useLibraryListScroll';
import { usePlaylistArtwork } from '../library/useFirstEntryArtwork';
import { useBackInterceptor } from '../useBackInterceptor';
import { useStableTrack } from '../useStableTrack';
import { PlaylistEditOutcome, usePlaylistTrackEdits } from '../library/usePlaylistTrackEdits';
import { BulkSelectionBar } from '../components/BulkSelectionBar';
import { useBulkSelection } from '../library/useBulkSelection';
import { BulkActionsSheet } from '../sheets/BulkActionsSheet';
import { favoritesLabels } from '../library/libraryCategories';
import { TOP_RATED_ALBUMS_ROW } from '../../session/libraryCategoryLoader';

export interface PlaylistsScreenProps {
  state: RemoteUiState;
  onAction: (action: RemoteAction) => void;
  contentBottomInset?: number;
}

const DETAIL_ARTWORK_SIZE = 120;
const TRACK_ROW_HEIGHT = 56;
const PLAYLISTS_ROOT_KEY = 'playlists';
const NO_ENTRIES: LibraryEntry[] = [];

function newPlaylistSubtitle(canCreate: boolean, canImport: boolean): string {
  if (canCreate && canImport) return 'Start empty, or import a file from this phone';
  if (canImport) return 'Import a playlist file from this phone';
  return 'Start with an empty playlist';
}

export function PlaylistsScreen({ state, onAction, contentBottomInset = Space.lg }: PlaylistsScreenProps) {
  const { t } = useI18n();
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
  const rootNames = useRef<string[]>([]);
  const { tileWidth } = useAlbumGrid();
  const snackbar = useSnackbar();

  const nested = state.libraryIsNested;
  const playlist = nested ? state.activePlaylist ?? null : null;
  const { label: favoritesLabel } = favoritesLabels(state.supportedFeatures);
  const playlistName = playlist?.key === '@favorites' ? t(favoritesLabel) : playlist ? playlistDisplayName(playlist.name) : '';
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
  const { rememberPush } = levels;

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
  const playlistArtwork = usePlaylistArtwork(playlist?.key, state.libraryEntries);

  if (!nested) {
    rootNames.current = state.libraryEntries
      .filter((entry) => entry.id !== TOP_RATED_ALBUMS_ROW.id)
      .map((entry) => playlistDisplayName(entry.title));
  }

  const listedEntries = useMemo(() => {
    if (nested) return state.libraryEntries;
    return state.libraryEntries.map((entry) =>
      entry.playlistKey === '@favorites' ? { ...entry, title: t(favoritesLabel) } : entry
    );
  }, [nested, state.libraryEntries, t, favoritesLabel]);
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

  const drag = useDragReorder({
    itemCount: tracks.length,
    rowHeight: TRACK_ROW_HEIGHT,
    enabled: editMode && !edits.busy,
    onMove: edits.move,
  });

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

  const items: LibraryItem[] = [];
  const shuffleActive = isShuffleMode(state.playbackMode);
  const nativeCollectionPlayback = state.supportedFeatures.includes('collection_playback');

  if (playlist) {
    const playableIds = songIds(state.libraryEntries);
    // Native playback covers songs past the loaded page, but an empty playlist has nothing to start.
    const playButtons = playableIds.length || (nativeCollectionPlayback && state.playlistTrackCount > 0) ? (
      <CollectionPlayButtons
        busy={state.collectionBusy}
        onPlay={() => playCollection(onAction, playableIds, false, shuffleActive, nativeCollectionPlayback)}
        onShuffle={() => playCollection(onAction, playableIds, true, shuffleActive, nativeCollectionPlayback)}
      />
    ) : null;
    const browseActions = (
      <>
        {playButtons}
        {canEditTracks ? (
          <>
            {playableIds.length ? <Button label={t('Edit')} variant="raised" onPress={() => setEditing(true)} /> : null}
            <IconButton
              icon="moreVertical"
              label={t('Playlist options')}
              variant="raised"
              onPress={() => setOptionsPlaylist(playlist)}
            />
          </>
        ) : null}
      </>
    );
    items.push(
      nodeItem('title', <ScreenTitleBar backLabel={t('Playlists')} onBack={() => onAction({ type: 'Back' })} />),
      nodeItem(
        'header',
        <CollectionHeader
          eyebrow={playlist.writable ? t('Playlist') : t('Made by the player · read only')}
          title={playlistName}
          meta={t('{count} song', { count: state.playlistTrackCount })}
          artworkUri={playlistArtwork}
          artworkSize={DETAIL_ARTWORK_SIZE}
          placeholderIcon="playlist"
          actions={
            canEditTracks ? (
              <CrossfadeLayers
                showSecond={editMode}
                first={browseActions}
                second={<PlaylistEditBar onDone={() => setEditing(false)} />}
              />
            ) : (
              browseActions
            )
          }
        />,
      ),
    );
  } else if (album) {
    items.push(
      nodeItem('title', <ScreenTitleBar onBack={() => onAction({ type: 'Back' })} />),
      nodeItem('album', (
        <AlbumCollectionHeader
          album={album}
          entries={state.libraryEntries}
          countLabel={state.libraryCountLabel}
          busy={state.collectionBusy}
          shuffleActive={shuffleActive}
          nativePlayback={nativeCollectionPlayback && state.connectionStatus === ConnectionStatus.Connected}
          onAction={onAction}
        />
      )),
    );
  } else if (nested) {
    items.push(
      nodeItem(
        'title',
        <ScreenTitleBar title={ratedAlbums ? t(TOP_RATED_ALBUMS_ROW.title) : nestedTitle === 'Tracks' ? t('Tracks') : nestedTitle ?? t('Playlists')} onBack={() => onAction({ type: 'Back' })} />,
      ),
    );
  } else {
    items.push(nodeItem('title', <ScreenTitleBar title={t('Playlists')} />));
    if (canEditPlaylists || canImport) {
      items.push(
        nodeItem(
          'new',
          <NewPlaylistRow
            subtitle={t(newPlaylistSubtitle(canEditPlaylists, canImport))}
            onPress={() => setNewSheetVisible(true)}
          />,
        ),
      );
    }
  }

  if (selectionMode) items.push(nodeItem('bulk-selection', <BulkSelectionBar count={selectedIds.size} onActions={bulkSelection.open} onCancel={exitSelection} />));

  const inlineError = inlineLibraryError(state);
  if (inlineError) {
    items.push(nodeItem('error', <InlineError message={inlineError} style={styles.inlineError} />));
  }

  const placeholder =
    playlist && edits.busy
      ? null
      : libraryStateMessage({
        translate: t,
        state,
        onAction,
        noun: playlist || album ? 'songs' : ratedAlbums ? 'albums' : 'playlists',
        empty: playlist
          ? { title: 'This playlist is empty', body: 'Add songs from their menu in the Library.' }
          : nested ? { title: 'Nothing here yet', body: album ? 'The player has no songs in this collection.' : undefined }
            : { title: 'No playlists yet', body: 'Create one here, or add songs to a playlist from their menu.' },
        onRetry: nested ? undefined : () => onAction({ type: 'RefreshLibrary', category: LibraryCategory.Playlists }),
      });

  const trackOffset = items.length;
  if (placeholder) {
    items.push(nodeItem('placeholder', <LibraryPlaceholder {...placeholder} />));
  } else if (nested) {
    items.push(...rowItems);
  } else {
    items.push(...rowItems.map((item) => item.type === 'entry' && item.entry.id === TOP_RATED_ALBUMS_ROW.id
      ? nodeItem(item.key, (
          <LibraryEntryRow
            entry={{ ...item.entry, title: t(item.entry.title) }}
            kind="playlist"
            onPress={openEntry}
            disabled={selectionMode}
          />
        ))
      : item));
  }

  const { rowStyle, handleProps, draggingIndex } = drag;
  const cellStyle = useCallback((index: number) => rowStyle(index - trackOffset), [rowStyle, trackOffset]);

  const currentSong = useStableTrack(state.currentTrack);
  const isPlaying = state.isPlaying;
  const { busy: editBusy, remove: removeTrack } = edits;
  const renderPlaylistTrack = useCallback(
    (entry: LibraryEntry, index: number) => {
      const current = isCurrentEntry(entry, currentSong);
      return (
        <PlaylistTrackRow
          entry={entry}
          index={index}
          editing={editMode}
          current={current}
          playing={current && isPlaying}
          lifted={draggingIndex === index}
          removeDisabled={editBusy}
          handleProps={editMode ? handleProps(index) : undefined}
          onPress={playTrack}
          onMore={showTrackActions}
          onRemove={removeTrack}
          selectionMode={selectionMode}
          selected={selectedIds.has(entry.id)}
          onSelect={selectEntry}
          onLongPress={beginTrackSelection}
        />
      );
    },
    [currentSong, isPlaying, editMode, draggingIndex, editBusy, handleProps, playTrack, showTrackActions, removeTrack, selectionMode, selectedIds, selectEntry, beginTrackSelection],
  );

  return (
    <View style={styles.screen}>
      <PageTransition style={styles.screen} transitionKey={levels.transitionKey} kind={levels.kind}>
        <DragReorderCellContext.Provider value={cellStyle}>
          <LibraryList
            items={items}
            songSwipe={songSwipe}
            onAction={onAction}
            onOpenEntry={openEntry}
            onEntryLongPress={longPressEntry}
            selectionMode={selectionMode}
            selectedIds={selectedIds}
            onSelectEntry={(entry) => selectEntry(entry)}
            onEntrySelectionLongPress={longPressEntry}
            renderPlaylistTrack={playlist ? renderPlaylistTrack : undefined}
            hasMore={state.libraryHasMore}
            status={state.libraryStatus}
            currentTrack={state.currentTrack}
            isPlaying={state.isPlaying}
            tileWidth={tileWidth}
            contentBottomInset={contentBottomInset}
            scroll={scroll}
            scrollEnabled={drag.scrollEnabled}
          />
        </DragReorderCellContext.Provider>
      </PageTransition>
      <NewPlaylistSheet
        visible={newSheetVisible}
        onClose={() => setNewSheetVisible(false)}
        onAction={onAction}
        canImport={canImport}
        canCreateEmpty={canEditPlaylists}
        takenNames={rootNames.current}
      />
      <PlaylistOptionsSheet
        visible={optionsPlaylist != null}
        playlist={optionsPlaylist}
        onClose={() => setOptionsPlaylist(null)}
        onAction={onAction}
        errorMessage={state.connectionMessage}
        entries={state.libraryEntries}
        takenNames={rootNames.current.filter(
          (name) => !optionsPlaylist || name !== playlistDisplayName(optionsPlaylist.name),
        )}
      />
      <BulkActionsSheet
        visible={bulkActionsOpen}
        ids={bulkSelection.ids ?? []}
        state={state}
        onAction={onAction}
        onClose={() => { bulkSelection.close(); exitSelection(); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  inlineError: {
    paddingHorizontal: Space.lg,
    paddingTop: Space.md,
  },
});
