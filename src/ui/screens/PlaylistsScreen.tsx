import React, { useCallback } from 'react';
import { useI18n } from '../../i18n';
import { StyleSheet, View } from 'react-native';
import {
  LibraryCategory,
  LibraryEntry,
  RemoteAction,
  RemoteUiState,
} from '../../data/types';
import { DragReorderCellContext } from '../components/dragReorderCellContext';
import { InlineError } from '../components/InlineError';
import { LibraryList } from '../components/LibraryList';
import { LibraryEntryRow } from '../components/LibraryEntryRow';
import { LibraryPlaceholder } from '../components/LibraryPlaceholder';
import { PageTransition } from '../components/PageTransition';
import { PlaylistTrackRow } from '../components/PlaylistTrackRow';
import { NewPlaylistSheet } from '../sheets/NewPlaylistSheet';
import { PlaylistOptionsSheet } from '../sheets/PlaylistOptionsSheet';
import { playlistDisplayName } from '../playlistName';
import { Space } from '../tokens';
import { useDragReorder } from '../useDragReorder';
import { isCurrentEntry } from '../library/libraryEntryKind';
import { LibraryItem, nodeItem } from '../library/libraryItems';
import { inlineLibraryError, libraryStateMessage } from '../library/libraryStateMessage';
import { useStableTrack } from '../useStableTrack';
import { BulkSelectionBar } from '../components/BulkSelectionBar';
import { BulkActionsSheet } from '../sheets/BulkActionsSheet';
import { TOP_RATED_ALBUMS_ROW } from '../../session/libraryCategoryLoader';

import {
  usePlaylistSelection, usePlaylistBrowsing, usePlaylistEditing, usePlaylistRows, usePlaylistNavigation,
  type Selection, type Browse, type Editing, type PlaylistRows, type PlaylistNavigation,
} from './usePlaylistsScreenState';
import { playlistHeaderItems } from './playlistHeaders';

export interface PlaylistsScreenProps {
  state: RemoteUiState;
  onAction: (action: RemoteAction) => void;
  contentBottomInset?: number;
}

const TRACK_ROW_HEIGHT = 56;
export function PlaylistsScreen({ state, onAction, contentBottomInset = Space.lg }: PlaylistsScreenProps) {
  const t = useI18n().t;
  const selection = usePlaylistSelection(state, onAction);
  const browse = usePlaylistBrowsing(state, onAction, selection.editing, t);
  const editing = usePlaylistEditing(state, onAction, selection, browse, t);
  const rows = usePlaylistRows(state, browse, editing, t);
  const drag = useDragReorder({
    itemCount: editing.tracks.length,
    rowHeight: TRACK_ROW_HEIGHT,
    enabled: browse.editMode && !editing.edits.busy,
    onMove: editing.edits.move,
  });
  const navigation = usePlaylistNavigation(onAction, browse, selection);
  const { items, trackOffset } = playlistItems({ state, onAction, selection, browse, editing, rows, navigation, t });
  const trackView = usePlaylistTrackView(state, browse, editing, selection, navigation, drag, trackOffset);
  return renderPlaylistsScreen({
    state, onAction, contentBottomInset, selection, browse, navigation, items, trackView, scrollEnabled: drag.scrollEnabled,
  });
}

type Translate = ReturnType<typeof useI18n>['t'];
type Action = PlaylistsScreenProps['onAction'];

interface PlaylistItemOptions {
  state: RemoteUiState;
  onAction: Action;
  selection: Selection;
  browse: Browse;
  editing: Editing;
  rows: PlaylistRows;
  navigation: PlaylistNavigation;
  t: Translate;
}

function playlistItems({ state, onAction, selection, browse, editing, rows, navigation, t }: PlaylistItemOptions) {
  const { selectionMode, selectedIds, bulkSelection, exitSelection, setEditing, setOptionsPlaylist, setNewSheetVisible } = selection;
  const { playlist, playlistName, album, nested, ratedAlbums, nestedTitle, canEditPlaylists, canImport, canEditTracks, editMode } = browse;
  const { playlistArtwork, rowItems } = rows;
  const { openEntry } = navigation;
  const { edits } = editing;
  const items = playlistHeaderItems({
    state, onAction, t, playlistName, playlist, canEditTracks, editMode, playlistArtwork, album, nested, ratedAlbums,
    nestedTitle, canEditPlaylists, canImport, setEditing, setOptionsPlaylist, setNewSheetVisible,
  });
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

  return { items, trackOffset };
}

function usePlaylistTrackView(
  state: RemoteUiState, { editMode }: Browse, { edits }: Editing, { selectionMode, selectedIds }: Selection,
  { playTrack, showTrackActions, selectEntry, beginTrackSelection }: PlaylistNavigation,
  drag: ReturnType<typeof useDragReorder>, trackOffset: number,
) {
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

  return { cellStyle, renderPlaylistTrack };
}

interface PlaylistRenderOptions {
  state: RemoteUiState;
  onAction: Action;
  contentBottomInset: number;
  selection: Selection;
  browse: Browse;
  navigation: PlaylistNavigation;
  items: LibraryItem[];
  trackView: ReturnType<typeof usePlaylistTrackView>;
  scrollEnabled: boolean;
}

function renderPlaylistsScreen({
  state, onAction, contentBottomInset, selection, browse, navigation, items, trackView, scrollEnabled,
}: PlaylistRenderOptions) {
  const { levels, playlist, songSwipe, tileWidth, scroll } = browse;
  const { openEntry, longPressEntry, selectEntry } = navigation;
  const { selectionMode, selectedIds } = selection;
  const { cellStyle, renderPlaylistTrack } = trackView;
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
            scrollEnabled={scrollEnabled}
          />
        </DragReorderCellContext.Provider>
      </PageTransition>
      {renderPlaylistSheets(state, onAction, selection, browse)}
    </View>
  );
}

function renderPlaylistSheets(state: RemoteUiState, onAction: Action, selection: Selection, browse: Browse) {
  const { newSheetVisible, setNewSheetVisible, optionsPlaylist, setOptionsPlaylist, bulkActionsOpen, bulkSelection, exitSelection } = selection;
  const { canImport, canEditPlaylists, rootNames } = browse;
  return (
    <>
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
    </>
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
