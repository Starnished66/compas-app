import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  ConnectionStatus,
  LibraryCategory,
  RemoteAction,
  RemoteUiState,
} from '../../data/types';
import { AlphabetRail } from '../components/AlphabetRail';
import { FlipGhostLayer } from '../components/FlipGhostLayer';
import { LibraryList } from '../components/LibraryList';
import { LibraryPlaceholderProps } from '../components/LibraryPlaceholder';
import { PageTransition } from '../components/PageTransition';
import { Space } from '../tokens';
import { letterOfEntry, railLetters } from '../library/alphabetIndex';
import { FlipContext } from '../library/flipRegistry';
import { categoryNoun, favoritesLabels, isSortableCategory } from '../library/libraryCategories';
import { entryItems, withLetterHeaders } from '../library/libraryItems';
import { isServerOrderedAlbumSort } from '../../session/librarySorting';
import { inlineLibraryError, libraryStateMessage } from '../library/libraryStateMessage';
import { isShuffleMode } from '../../session/playbackModes';
import { useTileItems } from '../library/useTileItems';
import { useSortDirection } from '../library/useSortDirection';
import { SearchScreen } from './SearchScreen';
import { BulkActionsSheet } from '../sheets/BulkActionsSheet';
import {
  useLibrarySetup, useLibraryNavigation, useLibrarySelectionLifetime, type LibrarySetup, type LibraryNavigation,
} from './useLibraryScreenNavigation';
import { libraryRootHeader, libraryCollectionHeader, libraryListToolbar, NESTED_ALBUMS_TITLE } from './libraryHeaders';

export interface LibraryScreenProps {
  state: RemoteUiState;
  onAction: (action: RemoteAction) => void;
  category: LibraryCategory;
  contentBottomInset?: number;
}

const ROOT_STICKY_HEADER_INDICES = [1];
const RAIL_GUTTER = 32;
const RAIL_ENTRY_INSET = RAIL_GUTTER - Space.xs;
const RAIL_TOP = 176;
const STICKY_CHIPS_OFFSET = 64;

function emptyMessage(category: LibraryCategory, nested: boolean, supportedFeatures: string[]): LibraryPlaceholderProps {
  if (category === LibraryCategory.Folders) return { title: 'This folder is empty' };
  if (nested) return { title: 'Nothing here yet', body: 'The player has no songs in this collection.' };
  switch (category) {
    case LibraryCategory.Favorites:
      return favoritesLabels(supportedFeatures).empty;
    case LibraryCategory.RecentlyAdded:
      return { title: 'Recently added', body: 'Use Play or Shuffle to play recently added music on the player.' };
    case LibraryCategory.Recent:
      return { title: 'Nothing played yet', body: 'Songs played on the player show up here.' };
    default:
      return { title: 'Your library is empty', body: 'Add music to the player, then reload the library.' };
  }
}

export function LibraryScreen({ state, onAction, category, contentBottomInset = Space.lg }: LibraryScreenProps) {
  const setup = useLibrarySetup(state, onAction, category);
  useLibrarySelectionLifetime(setup, state);
  const navigation = useLibraryNavigation(setup, onAction);
  const projection = useLibraryProjection(state, category, setup);
  const list = useLibraryItems({ state, onAction, category }, setup, navigation, projection);
  return renderLibraryScreen({ state, onAction, contentBottomInset }, setup, navigation, list);
}

function useLibraryProjection(state: RemoteUiState, category: LibraryCategory, setup: LibrarySetup) {
  const { nested, searchActive, ascending, setAscending, trail, grid, columns } = setup;
  const { librarySorting } = state;
  const sortable = !nested && isSortableCategory(category);
  const serverOrderedAlbums = category === LibraryCategory.Albums && isServerOrderedAlbumSort(librarySorting?.albums);
  const localDirectionSort = sortable && (category !== LibraryCategory.Albums || !serverOrderedAlbums);
  const entries = useSortDirection(state.libraryEntries, localDirectionSort && !ascending);
  useEffect(() => {
    if (category === LibraryCategory.Albums && serverOrderedAlbums) setAscending(true);
  }, [category, serverOrderedAlbums]);
  const step = nested ? trail.current : null;
  const artistDetail = nested && state.libraryNestedTitle === NESTED_ALBUMS_TITLE;
  const albumDetail = nested && !artistDetail && step?.kind === 'album';
  const albumEntries = albumDetail ? entries : null;
  // Features outlive a dropped link; don't offer playback the player can't receive right now.
  const nativeCollectionSupported =
    state.connectionStatus === ConnectionStatus.Connected && state.supportedFeatures.includes('collection_playback');
  const nativeCollectionPlayback =
    nativeCollectionSupported &&
    (artistDetail || albumDetail) &&
    [LibraryCategory.Albums, LibraryCategory.Artists, LibraryCategory.AlbumArtists].includes(category);
  const nativeRootSongsPlayback =
    nativeCollectionSupported &&
    !nested &&
    [LibraryCategory.Songs, LibraryCategory.Favorites, LibraryCategory.RecentlyAdded, LibraryCategory.Recent].includes(category);
  const nativeGenrePlayback =
    nativeCollectionSupported && category === LibraryCategory.Genres && nested && state.libraryNestedTitle === 'Tracks';
  const gridCapable = (!nested && category === LibraryCategory.Albums) || artistDetail;
  const showGrid = gridCapable && grid;
  const lettered = !nested && category === LibraryCategory.Songs;
  const nestedTitle = state.libraryNestedTitle;

  const tiles = useTileItems(entries, columns, showGrid && !searchActive);
  const rows = useMemo(() => {
    if (searchActive) return [];
    if (showGrid) return tiles;
    const entryRows = entryItems(entries, { category, isNested: nested, nestedTitle }, albumDetail);
    return lettered ? withLetterHeaders(entryRows, letterOfEntry) : entryRows;
  }, [searchActive, showGrid, tiles, entries, category, nested, nestedTitle, albumDetail, lettered]);
  const rowLetters = useMemo(() => (lettered ? railLetters(rows) : []), [lettered, rows]);

  return {
    entries, step, artistDetail, albumDetail, albumEntries, nativeCollectionPlayback, nativeRootSongsPlayback,
    nativeGenrePlayback, gridCapable, showGrid, lettered, nestedTitle, rows, rowLetters, localDirectionSort,
  };
}

type LibraryProjection = ReturnType<typeof useLibraryProjection>;

function useLibraryItems(
  { state, onAction, category }: LibraryScreenProps,
  setup: LibrarySetup,
  { flip }: LibraryNavigation,
  projection: LibraryProjection,
) {
  const { nested, searchActive, t, insets, chipsHeader, selectedIds, selectionMode, bulkSelection, exitSelection,
    ascending, setAscending, setGrid, setSearchOpen } = setup;
  const { entries, step, artistDetail, albumDetail, albumEntries, nativeCollectionPlayback, nativeRootSongsPlayback,
    nativeGenrePlayback, gridCapable, showGrid, lettered, nestedTitle, rows, rowLetters, localDirectionSort } = projection;
  const noun = nested ? (artistDetail ? 'albums' : 'items') : categoryNoun(category, state.supportedFeatures);
  const connected = state.connectionStatus === ConnectionStatus.Connected;
  const shuffleActive = isShuffleMode(state.playbackMode);
  const railGutter = lettered && entries.length > 0 ? RAIL_GUTTER : undefined;
  const inlineError = inlineLibraryError(state);
  const { libraryCountLabel, collectionBusy, supportedFeatures } = state;
  const { onLeadingLayout, stuck: chipsStuck } = chipsHeader;
  const insetTop = insets.top;
  const selectedCount = selectedIds.size;
  const entryCount = entries.length;

  const placeholder = useLibraryPlaceholder(state, onAction, category, noun, nested, t);

  const headerItems = useMemo(() => {
    if (searchActive) return [];
    const items = nested
      ? libraryCollectionHeader({
        albumDetail, step, nestedTitle, artistDetail, nativeCollectionPlayback, nativeGenrePlayback,
        albumEntries, libraryCountLabel, collectionBusy, shuffleActive, onAction, t,
      })
      : libraryRootHeader({
        onLeadingLayout, setSearchOpen, chipsStuck, insetTop, supportedFeatures, category,
        connected, railGutter, nativeRootSongsPlayback, collectionBusy, shuffleActive, onAction, t,
      });
    return items.concat(libraryListToolbar({
      inlineError, placeholder, selectionMode, selectedCount, openBulk: bulkSelection.open, exitSelection,
      albumDetail, entryCount, noun, ascending, localDirectionSort, showGrid, gridCapable,
      flip, setAscending, setGrid, libraryCountLabel, railGutter, t,
    }));
  }, [
    searchActive, nested, albumDetail, step, nestedTitle, t, onAction, artistDetail, nativeCollectionPlayback,
    nativeGenrePlayback, nativeRootSongsPlayback, collectionBusy, shuffleActive, onLeadingLayout, chipsStuck, insetTop,
    supportedFeatures, category, connected, railGutter, albumEntries, libraryCountLabel,
    inlineError, placeholder, selectionMode, selectedCount, bulkSelection.open, exitSelection, entryCount, noun, ascending, localDirectionSort,
    showGrid, gridCapable, flip,
  ]);

  return useProjectedItems(headerItems, rows, rowLetters, placeholder);
}

function useLibraryPlaceholder(
  state: RemoteUiState,
  onAction: LibraryScreenProps['onAction'],
  category: LibraryCategory,
  noun: string,
  nested: boolean,
  t: ReturnType<typeof useLibrarySetup>['t'],
) {
  const hasLoadedEntries = state.libraryEntries.length > 0;
  const { supportedFeatures, connectionStatus, connectionMessage, libraryStatus, libraryCountLabel } = state;
  // Header nodes and the list data are memoized on the fields they show, so session updates that change none of
  // them (playback, queue, position) keep every list item identical and LibraryList skips the render.
  return useMemo(
    () =>
      libraryStateMessage({
        translate: t,
        state,
        onAction,
        noun,
        empty: emptyMessage(category, nested, supportedFeatures),
        onRetry: nested ? undefined : () => onAction({ type: 'RefreshLibrary', category }),
      }),
    [t, onAction, noun, category, nested, supportedFeatures, connectionStatus, connectionMessage, hasLoadedEntries, libraryStatus, libraryCountLabel],
  );
}

function useProjectedItems(
  headerItems: ReturnType<typeof libraryRootHeader>,
  rows: LibraryProjection['rows'],
  rowLetters: LibraryProjection['rowLetters'],
  placeholder: ReturnType<typeof libraryStateMessage>,
) {
  const rowsStart = headerItems.length;
  const letters = useMemo(
    () => (placeholder ? [] : rowLetters.map((letter) => ({ ...letter, itemIndex: letter.itemIndex + rowsStart }))),
    [placeholder, rowLetters, rowsStart],
  );
  const listItems = useMemo(
    () => (placeholder ? headerItems : headerItems.concat(rows)),
    [placeholder, headerItems, rows],
  );

  return { letters, listItems };
}

type LibraryItems = ReturnType<typeof useLibraryItems>;

function renderLibraryScreen(
  { state, onAction, contentBottomInset }: Pick<LibraryScreenProps, 'state' | 'onAction'> & { contentBottomInset: number },
  setup: LibrarySetup,
  navigation: LibraryNavigation,
  list: LibraryItems,
) {
  const { bulkSelection, exitSelection, searchActive, scroll, selectionMode, selectedIds,
    songSwipe, tileWidth, nested } = setup;
  const { openEntry, closeSearch, selectEntry, longPressEntry } = navigation;
  const { letters, listItems } = list;
  const { scrollToTop } = scroll;
  const page = (content: React.ReactNode, rail?: React.ReactNode) =>
    renderLibraryPage(content, rail, setup, state, onAction);

  if (searchActive) {
    return page(
      <SearchScreen
        state={state}
        onAction={onAction}
        onOpenEntry={openEntry}
        onClose={closeSearch}
        contentBottomInset={contentBottomInset}
        scroll={scroll}
        selectionMode={selectionMode}
        selectedIds={selectedIds}
        onSelectEntry={selectEntry}
        onEntrySelectionLongPress={longPressEntry}
        onOpenBulkActions={bulkSelection.open}
        onCancelSelection={exitSelection}
      />,
    );
  }

  const jumpToItem = libraryLetterJump(letters, scroll, scrollToTop);

  return page(
    <LibraryList
      items={listItems}
      songSwipe={songSwipe}
      onAction={onAction}
      onOpenEntry={openEntry}
      onEntryLongPress={longPressEntry}
      selectionMode={selectionMode}
      selectedIds={selectedIds}
      onSelectEntry={selectEntry}
      onEntrySelectionLongPress={longPressEntry}
      hasMore={state.libraryHasMore}
      status={state.libraryStatus}
      currentTrack={state.currentTrack}
      isPlaying={state.isPlaying}
      tileWidth={tileWidth}
      stickyHeaderIndices={nested ? undefined : ROOT_STICKY_HEADER_INDICES}
      contentBottomInset={contentBottomInset}
      entryInsetRight={letters.length ? RAIL_ENTRY_INSET : undefined}
      scroll={scroll}
    />,
    <AlphabetRail letters={letters} top={RAIL_TOP} bottom={contentBottomInset} onSelect={jumpToItem} />,
  );
}

function libraryLetterJump(
  letters: LibraryItems['letters'], scroll: LibrarySetup['scroll'], scrollToTop: LibrarySetup['scroll']['scrollToTop'],
) {
  // The first letter goes to the very top, so the header (and its selection bar) isn't left under the chips.
  return (index: number) =>
    index <= (letters[0]?.itemIndex ?? 0)
      ? scrollToTop(false)
      : scroll.listRef.current?.scrollToIndex({ index, animated: false, viewOffset: STICKY_CHIPS_OFFSET });
}

function renderLibraryPage(
  content: React.ReactNode,
  rail: React.ReactNode,
  setup: LibrarySetup,
  state: RemoteUiState,
  onAction: LibraryScreenProps['onAction'],
) {
  const { flipRegistry, levels, bulkActionsOpen, bulkSelection, exitSelection } = setup;
  return (
    <FlipContext.Provider value={flipRegistry}>
      <View style={styles.screen}>
        <PageTransition style={styles.screen} transitionKey={levels.transitionKey} kind={levels.kind}>
          {content}
          {rail}
        </PageTransition>
        <FlipGhostLayer />
        <BulkActionsSheet
          visible={bulkActionsOpen}
          ids={bulkSelection.ids ?? []}
          state={state}
          onAction={onAction}
          onClose={() => { bulkSelection.close(); exitSelection(); }}
        />
      </View>
    </FlipContext.Provider>
  );
}

const styles = StyleSheet.create({ screen: { flex: 1 } });
