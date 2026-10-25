import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../i18n';
import { localizedCountLabel, localizedEntrySubtitle } from '../localizedLabels';
import { StyleSheet, View } from 'react-native';
import {
  ConnectionStatus,
  ContentStatus,
  LibraryCategory,
  LibraryEntry,
  RemoteAction,
  RemoteUiState,
} from '../../data/types';
import { AlphabetRail } from '../components/AlphabetRail';
import { CategoryChips } from '../components/CategoryChips';
import { CollectionHeader } from '../components/CollectionHeader';
import { CollectionPlayButtons } from '../components/CollectionPlayButtons';
import { FlipGhostLayer } from '../components/FlipGhostLayer';
import { InlineError } from '../components/InlineError';
import { LibraryList } from '../components/LibraryList';
import { LibraryPlaceholder, LibraryPlaceholderProps } from '../components/LibraryPlaceholder';
import { LibrarySyncCard } from '../components/LibrarySyncCard';
import { LibraryToolbar } from '../components/LibraryToolbar';
import { PageTransition } from '../components/PageTransition';
import { ScreenTitleBar } from '../components/ScreenTitleBar';
import { SearchLauncher } from '../components/SearchLauncher';
import { StickyFrostBar } from '../components/StickyFrostBar';
import { useScrollToTopRequest } from '../chrome/useScrollToTopRequest';
import { Space } from '../tokens';
import { useReducedMotion } from '../useReducedMotion';
import { useScreenInsets } from '../useScreenInsets';
import { letterOfEntry, railLetters } from '../library/alphabetIndex';
import { FlipContext, FlipMode, FlipRegistry } from '../library/flipRegistry';
import { availableCategoryOptions, categoryNoun, isSortableCategory } from '../library/libraryCategories';
import { LibraryEntryKind, opensCollection } from '../library/libraryEntryKind';
import { LibraryItem, entryItems, nodeItem, songIds, withLetterHeaders } from '../library/libraryItems';
import { inlineLibraryError, libraryStateMessage } from '../library/libraryStateMessage';
import { playCollection } from '../library/collectionPlayback';
import { isShuffleMode } from '../../session/playbackModes';
import { useAlbumGrid } from '../library/useAlbumGrid';
import { useCollectionTrail } from '../library/useCollectionTrail';
import { useFirstEntryArtwork } from '../library/useFirstEntryArtwork';
import { useLibraryLevels } from '../library/useLibraryLevels';
import { useLibraryListScroll } from '../library/useLibraryListScroll';
import { useStuckHeader } from '../library/useStuckHeader';
import { useTileItems } from '../library/useTileItems';
import { useSortDirection } from '../library/useSortDirection';
import { useBackInterceptor } from '../useBackInterceptor';
import { useTabActive } from '../tabActivity';
import { SearchScreen } from './SearchScreen';
import { BulkSelectionBar } from '../components/BulkSelectionBar';
import { BulkActionsSheet } from '../sheets/BulkActionsSheet';

export interface LibraryScreenProps {
  state: RemoteUiState;
  onAction: (action: RemoteAction) => void;
  category: LibraryCategory;
  contentBottomInset?: number;
}

const ROOT_STICKY_HEADER_INDICES = [1];
const NESTED_ALBUMS_TITLE = 'Albums';
const RAIL_GUTTER = 32;
const RAIL_ENTRY_INSET = RAIL_GUTTER - Space.xs;
const RAIL_TOP = 176;
const STICKY_CHIPS_OFFSET = 64;

function emptyMessage(category: LibraryCategory, nested: boolean): LibraryPlaceholderProps {
  if (category === LibraryCategory.Folders) return { title: 'This folder is empty' };
  if (nested) return { title: 'Nothing here yet', body: 'The player has no songs in this collection.' };
  switch (category) {
    case LibraryCategory.Favorites:
      return { title: 'No favorites yet', body: 'Tap the heart on Now Playing or in a song’s menu.' };
    case LibraryCategory.Recent:
      return { title: 'Nothing played yet', body: 'Songs played on the player show up here.' };
    default:
      return { title: 'Your library is empty', body: 'Add music to the player, then reload the library.' };
  }
}

export function LibraryScreen({ state, onAction, category, contentBottomInset = Space.lg }: LibraryScreenProps) {
  const { t } = useI18n();
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkActionsOpen, setBulkActionsOpen] = useState(false);
  const exitSelection = useCallback(() => { setSelectionMode(false); setSelectedIds(new Set()); }, []);
  const tabActive = useTabActive();
  useEffect(() => {
    if (!tabActive) setSearchOpen(false);
  }, [tabActive]);
  const [ascending, setAscending] = useState(true);
  const [grid, setGrid] = useState(true);
  const [flipSerial, setFlipSerial] = useState(0);
  const flipRegistry = useRef(new FlipRegistry()).current;
  const reducedMotion = useReducedMotion();
  const browseCategory = useRef(LibraryCategory.Albums);
  if (category !== LibraryCategory.Search) browseCategory.current = category;
  const { columns, tileWidth } = useAlbumGrid();
  const nested = state.libraryIsNested;
  const librarySorting = state.librarySorting;
  const albumSortMode = librarySorting?.albums.effective ?? 0;
  const searchActive = (searchOpen || category === LibraryCategory.Search) && !nested;
  const trail = useCollectionTrail(state.libraryEntries, nested);
  const { rememberOpening } = trail;
  const insets = useScreenInsets();
  const chipsHeader = useStuckHeader();
  const scroll = useLibraryListScroll(chipsHeader.trackOffset);
  const { scrollToTop, restoreOffset } = scroll;
  const levels = useLibraryLevels({
    entries: state.libraryEntries,
    nested,
    rootKey: searchActive ? LibraryCategory.Search : category,
    currentOffset: scroll.offset,
    onEnterLevel: (offset) => (offset ? restoreOffset(offset) : scrollToTop()),
  });
  const { rememberPush } = levels;

  // Entry IDs belong to the open collection: leaving it ends selection, while the next page (or a refresh of the
  // same list) only drops IDs that are no longer listed.
  const collectionKey = [
    levels.transitionKey,
    nested,
    state.libraryNestedTitle ?? '',
    trail.current?.entry.id ?? '',
    searchActive ? state.libraryQuery : '',
  ].join('|');
  const selectionCollection = useRef(collectionKey);
  useEffect(() => {
    if (bulkActionsOpen) return;
    if (selectionCollection.current !== collectionKey) {
      selectionCollection.current = collectionKey;
      exitSelection();
      return;
    }
    if (!state.libraryEntries.length && state.libraryStatus === ContentStatus.Loading) return;
    setSelectedIds((previous) => {
      if (!previous.size) return previous;
      const listed = new Set(state.libraryEntries.map((entry) => entry.id));
      const kept = [...previous].filter((id) => listed.has(id));
      return kept.length === previous.size ? previous : new Set(kept);
    });
  }, [collectionKey, state.libraryEntries, state.libraryStatus, bulkActionsOpen, exitSelection]);

  useLayoutEffect(() => {
    if (flipSerial) flipRegistry.play();
  }, [flipRegistry, flipSerial]);

  const flip = useCallback((mode: FlipMode, apply: () => void) => {
    if (!reducedMotion) flipRegistry.begin(mode);
    apply();
    setFlipSerial((value) => value + 1);
  }, [flipRegistry, reducedMotion]);

  const openEntry = useCallback(
    (entry: LibraryEntry, kind: LibraryEntryKind) => {
      if (opensCollection(kind)) {
        rememberOpening({ entry, kind });
        rememberPush();
      }
      onAction({ type: 'SelectLibraryEntry', id: entry.id });
    },
    [onAction, rememberOpening, rememberPush],
  );

  const longPressEntry = useCallback(
    (entry: LibraryEntry, kind: LibraryEntryKind) => {
      if (['song', 'album', 'artist', 'genre', 'playlist'].includes(kind)) {
        if (selectionMode) {
          setSelectedIds((previous) => {
            const next = new Set(previous);
            if (next.has(entry.id)) next.delete(entry.id);
            else next.add(entry.id);
            return next;
          });
        } else {
          setSelectedIds(new Set([entry.id]));
          setSelectionMode(true);
        }
      }
    },
    [selectionMode],
  );
  const selectEntry = useCallback((entry: LibraryEntry, kind: LibraryEntryKind) => {
    if (!['song', 'album', 'artist', 'genre', 'playlist'].includes(kind)) return;
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(entry.id)) next.delete(entry.id);
      else next.add(entry.id);
      return next;
    });
  }, []);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    onAction({ type: 'SearchLibrary', query: '' });
  }, [onAction]);
  // Search must close like Cancel; letting Back reach navigateBack strands the results on a spinner.
  useBackInterceptor(selectionMode || searchActive, () => {
    if (selectionMode) exitSelection();
    else closeSearch();
  });

  useScrollToTopRequest('library', () => {
    if (nested) {
      setSearchOpen(false);
      onAction({ type: 'OpenLibrary', category: browseCategory.current });
    } else if (searchActive) {
      closeSearch();
    } else {
      scrollToTop(true);
    }
  });

  const sortable = !nested && isSortableCategory(category);
  const localDirectionSort = sortable && (category !== LibraryCategory.Albums || albumSortMode === 0);
  const entries = useSortDirection(state.libraryEntries, localDirectionSort && !ascending);
  useEffect(() => {
    if (category === LibraryCategory.Albums && albumSortMode !== 0) setAscending(true);
  }, [category, albumSortMode]);
  const step = nested ? trail.current : null;
  const artistDetail = nested && state.libraryNestedTitle === NESTED_ALBUMS_TITLE;
  const albumDetail = nested && !artistDetail && step?.kind === 'album';
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
    [LibraryCategory.Songs, LibraryCategory.Favorites, LibraryCategory.Recent].includes(category);
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
  const playableIds = useMemo(() => (albumDetail ? songIds(entries) : []), [albumDetail, entries]);
  const albumArtwork = useFirstEntryArtwork(albumDetail ? entries : null, step?.entry);

  const noun = nested ? (artistDetail ? 'albums' : 'items') : categoryNoun(category);
  const connected = state.connectionStatus === ConnectionStatus.Connected;
  const shuffleActive = isShuffleMode(state.playbackMode);
  const railGutter = lettered && entries.length > 0 ? RAIL_GUTTER : undefined;
  const inlineError = inlineLibraryError(state);
  const hasLoadedEntries = state.libraryEntries.length > 0;
  const { connectionStatus, connectionMessage, libraryStatus, libraryCountLabel, collectionBusy, catalogSyncMessage, supportedFeatures } = state;
  const { onLeadingLayout, stuck: chipsStuck } = chipsHeader;
  const insetTop = insets.top;
  const selectedCount = selectedIds.size;
  const entryCount = entries.length;

  // Header nodes and the list data are memoized on the fields they show, so session updates that change none of
  // them (playback, queue, position) keep every list item identical and LibraryList skips the render.
  const placeholder = useMemo(
    () =>
      libraryStateMessage({
        translate: t,
        state,
        onAction,
        noun,
        empty: emptyMessage(category, nested),
        onRetry: nested ? undefined : () => onAction({ type: 'RefreshLibrary', category }),
      }),
    // libraryStateMessage reads only these fields of state.
    [t, onAction, noun, category, nested, connectionStatus, connectionMessage, hasLoadedEntries, libraryStatus, libraryCountLabel],
  );

  const headerItems = useMemo(() => {
    const items: LibraryItem[] = [];
    if (searchActive) return items;
    const playButtons = (ids: string[], native: boolean) => (
      <CollectionPlayButtons
        busy={collectionBusy}
        onPlay={() => playCollection(onAction, ids, false, shuffleActive, native)}
        onShuffle={() => playCollection(onAction, ids, true, shuffleActive, native)}
      />
    );
    if (nested) {
      items.push(
        nodeItem(
          'title',
          <ScreenTitleBar
            title={albumDetail ? undefined : step?.entry.title ?? (nestedTitle === 'Tracks' || nestedTitle === NESTED_ALBUMS_TITLE ? t(nestedTitle) : nestedTitle) ?? undefined}
            onBack={() => onAction({ type: 'Back' })}
          />,
        ),
      );
      if ((artistDetail && nativeCollectionPlayback) || nativeGenrePlayback) {
        items.push(nodeItem('collection-playback', <View style={styles.collectionActions}>{playButtons([], true)}</View>));
      }
    } else {
      items.push(
        nodeItem(
          'heading',
          <View onLayout={onLeadingLayout}>
            <ScreenTitleBar title={t('Library')} />
            <SearchLauncher label={t('Search artists, albums, songs')} onPress={() => setSearchOpen(true)} />
          </View>,
        ),
        nodeItem(
          'chips',
          <StickyFrostBar extended={chipsStuck} extension={insetTop}>
            <CategoryChips
              options={availableCategoryOptions(supportedFeatures)}
              value={category}
              onChange={(value) => onAction({ type: 'OpenLibrary', category: value })}
            />
          </StickyFrostBar>,
        ),
      );
      if (connected) {
        items.push(
          nodeItem(
            'sync',
            <LibrarySyncCard
              message={catalogSyncMessage}
              insetRight={railGutter}
              onRefresh={() => onAction({ type: 'RefreshLibrary', category })}
            />,
          ),
        );
      }
      if (nativeRootSongsPlayback) {
        items.push(nodeItem('collection-playback', <View style={styles.collectionActions}>{playButtons([], true)}</View>));
      }
    }

    if (albumDetail && step) {
      items.push(
        nodeItem(
          'album',
          <CollectionHeader
            eyebrow={t('Album')}
            title={step.entry.title}
            subtitle={localizedEntrySubtitle(step.entry, t)}
            meta={localizedCountLabel(libraryCountLabel, t) || undefined}
            artworkUri={albumArtwork}
            actions={playableIds.length || nativeCollectionPlayback ? playButtons(playableIds, nativeCollectionPlayback) : undefined}
          />,
        ),
      );
    }

    if (inlineError) {
      items.push(nodeItem('error', <InlineError message={inlineError} style={styles.inlineError} />));
    }

    if (placeholder) {
      items.push(nodeItem('placeholder', <LibraryPlaceholder {...placeholder} />));
    } else {
      if (selectionMode) {
        items.push(nodeItem('selection', <BulkSelectionBar count={selectedCount} onActions={() => setBulkActionsOpen(true)} onCancel={exitSelection} />));
      }
      if (!albumDetail) {
        items.push(
          nodeItem(
            'toolbar',
            <LibraryToolbar
              countLabel={localizedCountLabel(libraryCountLabel || `${entryCount} ${noun}`, t)}
              ascending={ascending}
              onToggleSort={localDirectionSort ? () => flip('sort', () => setAscending((value) => !value)) : undefined}
              grid={showGrid}
              onToggleGrid={gridCapable ? () => flip('view', () => setGrid((value) => !value)) : undefined}
              insetRight={railGutter}
            />,
          ),
        );
      }
    }
    return items;
  }, [
    searchActive, nested, albumDetail, step, nestedTitle, t, onAction, artistDetail, nativeCollectionPlayback,
    nativeGenrePlayback, nativeRootSongsPlayback, collectionBusy, shuffleActive, onLeadingLayout, chipsStuck, insetTop,
    supportedFeatures, category, connected, catalogSyncMessage, railGutter, albumArtwork, playableIds, libraryCountLabel,
    inlineError, placeholder, selectionMode, selectedCount, exitSelection, entryCount, noun, ascending, localDirectionSort,
    showGrid, gridCapable, flip,
  ]);

  const rowsStart = headerItems.length;
  const letters = useMemo(
    () => (placeholder ? [] : rowLetters.map((letter) => ({ ...letter, itemIndex: letter.itemIndex + rowsStart }))),
    [placeholder, rowLetters, rowsStart],
  );
  const listItems = useMemo(
    () => (placeholder ? headerItems : headerItems.concat(rows)),
    [placeholder, headerItems, rows],
  );

  const page = (content: React.ReactNode, rail?: React.ReactNode) => (
    <FlipContext.Provider value={flipRegistry}>
      <View style={styles.screen}>
        <PageTransition style={styles.screen} transitionKey={levels.transitionKey} kind={levels.kind}>
          {content}
          {rail}
        </PageTransition>
        <FlipGhostLayer />
        <BulkActionsSheet
          visible={bulkActionsOpen}
          ids={[...selectedIds]}
          state={state}
          onAction={onAction}
          onClose={() => { setBulkActionsOpen(false); exitSelection(); }}
        />
      </View>
    </FlipContext.Provider>
  );

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
        onOpenBulkActions={() => setBulkActionsOpen(true)}
        onCancelSelection={exitSelection}
      />,
    );
  }

  // The first letter goes to the very top, so the header (and its selection bar) isn't left under the chips.
  const jumpToItem = (index: number) =>
    index <= (letters[0]?.itemIndex ?? 0)
      ? scrollToTop(false)
      : scroll.listRef.current?.scrollToIndex({ index, animated: false, viewOffset: STICKY_CHIPS_OFFSET });

  return page(
    <LibraryList
      items={listItems}
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

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  collectionActions: { flexDirection: 'row', gap: Space.md, paddingHorizontal: Space.lg, paddingVertical: Space.sm },
  inlineError: {
    paddingHorizontal: Space.lg,
    paddingTop: Space.md,
  },
});
