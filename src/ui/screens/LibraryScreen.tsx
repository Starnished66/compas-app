import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  ConnectionStatus,
  LibraryCategory,
  LibraryEntry,
  PlaybackMode,
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
import { LibraryItem, entryItems, nodeItem, songIds, tileItems, withLetterHeaders } from '../library/libraryItems';
import { inlineLibraryError, libraryStateMessage } from '../library/libraryStateMessage';
import { playCollection } from '../library/collectionPlayback';
import { useAlbumGrid } from '../library/useAlbumGrid';
import { useCollectionTrail } from '../library/useCollectionTrail';
import { useLibraryLevels } from '../library/useLibraryLevels';
import { useLibraryListScroll } from '../library/useLibraryListScroll';
import { useStuckHeader } from '../library/useStuckHeader';
import { useTitleSortedEntries } from '../library/useTitleSortedEntries';
import { useBackInterceptor } from '../useBackInterceptor';
import { SearchScreen } from './SearchScreen';

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
  const [searchOpen, setSearchOpen] = useState(false);
  useBackInterceptor(searchOpen && !state.libraryQuery, () => setSearchOpen(false));
  const [ascending, setAscending] = useState(true);
  const [grid, setGrid] = useState(true);
  const [flipSerial, setFlipSerial] = useState(0);
  const flipRegistry = useRef(new FlipRegistry()).current;
  const reducedMotion = useReducedMotion();
  const browseCategory = useRef(LibraryCategory.Albums);
  if (category !== LibraryCategory.Search) browseCategory.current = category;
  const { columns, tileWidth } = useAlbumGrid();
  const nested = state.libraryIsNested;
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

  useLayoutEffect(() => {
    if (flipSerial) flipRegistry.play();
  }, [flipRegistry, flipSerial]);

  const flip = (mode: FlipMode, apply: () => void) => {
    if (!reducedMotion) flipRegistry.begin(mode);
    apply();
    setFlipSerial((value) => value + 1);
  };

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
      if (kind === 'song') onAction({ type: 'OpenSongActions', id: entry.id });
    },
    [onAction],
  );

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    onAction({ type: 'SearchLibrary', query: '' });
  }, [onAction]);

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
  const entries = useTitleSortedEntries(state.libraryEntries, sortable, ascending);
  const step = nested ? trail.current : null;
  const artistDetail = nested && state.libraryNestedTitle === NESTED_ALBUMS_TITLE;
  const albumDetail = nested && !artistDetail && step?.kind === 'album';
  const gridCapable = (!nested && category === LibraryCategory.Albums) || artistDetail;
  const showGrid = gridCapable && grid;
  const lettered = !nested && category === LibraryCategory.Songs;
  const nestedTitle = state.libraryNestedTitle;

  const rows = useMemo(() => {
    if (searchActive) return [];
    if (showGrid) return tileItems(entries, columns);
    const entryRows = entryItems(entries, { category, isNested: nested, nestedTitle }, albumDetail);
    return lettered ? withLetterHeaders(entryRows, letterOfEntry) : entryRows;
  }, [searchActive, showGrid, entries, columns, category, nested, nestedTitle, albumDetail, lettered]);
  const rowLetters = useMemo(() => (lettered ? railLetters(rows) : []), [lettered, rows]);
  const playableIds = useMemo(() => (albumDetail ? songIds(entries) : []), [albumDetail, entries]);

  const page = (content: React.ReactNode, rail?: React.ReactNode) => (
    <FlipContext.Provider value={flipRegistry}>
      <View style={styles.screen}>
        <PageTransition style={styles.screen} transitionKey={levels.transitionKey} kind={levels.kind}>
          {content}
          {rail}
        </PageTransition>
        <FlipGhostLayer />
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
      />,
    );
  }

  const noun = nested ? (artistDetail ? 'albums' : 'items') : categoryNoun(category);
  const connected = state.connectionStatus === ConnectionStatus.Connected;
  const shuffleActive = state.playbackMode === PlaybackMode.Shuffle;
  const railGutter = lettered && entries.length > 0 ? RAIL_GUTTER : undefined;

  const items: LibraryItem[] = [];
  if (nested) {
    items.push(
      nodeItem(
        'title',
        <ScreenTitleBar
          title={albumDetail ? undefined : step?.entry.title ?? state.libraryNestedTitle ?? undefined}
          onBack={() => onAction({ type: 'Back' })}
        />,
      ),
    );
  } else {
    items.push(
      nodeItem(
        'heading',
        <View onLayout={chipsHeader.onLeadingLayout}>
          <ScreenTitleBar title="Library" />
          <SearchLauncher label="Search artists, albums, songs" onPress={() => setSearchOpen(true)} />
        </View>,
      ),
      nodeItem(
        'chips',
        <StickyFrostBar extended={chipsHeader.stuck} extension={insets.top}>
          <CategoryChips
            options={availableCategoryOptions(state.supportedFeatures)}
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
            message={state.catalogSyncMessage}
            insetRight={railGutter}
            onRefresh={() => onAction({ type: 'RefreshLibrary', category })}
          />,
        ),
      );
    }
  }

  if (albumDetail && step) {
    items.push(
      nodeItem(
        'album',
        <CollectionHeader
          eyebrow="Album"
          title={step.entry.title}
          subtitle={step.entry.subtitle}
          meta={state.libraryCountLabel ?? undefined}
          artworkUri={step.entry.artwork ?? entries.find((entry) => entry.artwork)?.artwork}
          actions={
            playableIds.length ? (
              <CollectionPlayButtons
                onPlay={() => playCollection(onAction, playableIds, false, shuffleActive)}
                onShuffle={() => playCollection(onAction, playableIds, true, shuffleActive)}
              />
            ) : undefined
          }
        />,
      ),
    );
  }

  const inlineError = inlineLibraryError(state);
  if (inlineError) {
    items.push(nodeItem('error', <InlineError message={inlineError} style={styles.inlineError} />));
  }

  const placeholder = libraryStateMessage({
    state,
    onAction,
    noun,
    empty: emptyMessage(category, nested),
    onRetry: nested ? undefined : () => onAction({ type: 'RefreshLibrary', category }),
  });

  if (placeholder) {
    items.push(nodeItem('placeholder', <LibraryPlaceholder {...placeholder} />));
  } else {
    if (!albumDetail) {
      items.push(
        nodeItem(
          'toolbar',
          <LibraryToolbar
            countLabel={state.libraryCountLabel || `${entries.length} ${noun}`}
            ascending={ascending}
            onToggleSort={sortable ? () => flip('sort', () => setAscending((value) => !value)) : undefined}
            grid={showGrid}
            onToggleGrid={gridCapable ? () => flip('view', () => setGrid((value) => !value)) : undefined}
            insetRight={railGutter}
          />,
        ),
      );
    }
  }
  const rowsStart = items.length;
  const letters = placeholder
    ? []
    : rowLetters.map((letter) => ({ ...letter, itemIndex: letter.itemIndex + rowsStart }));
  const listItems = placeholder ? items : items.concat(rows);
  const jumpToItem = (index: number) =>
    scroll.listRef.current?.scrollToIndex({ index, animated: false, viewOffset: STICKY_CHIPS_OFFSET });

  return page(
    <LibraryList
      items={listItems}
      onAction={onAction}
      onOpenEntry={openEntry}
      onEntryLongPress={longPressEntry}
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
  inlineError: {
    paddingHorizontal: Space.lg,
    paddingTop: Space.md,
  },
});
