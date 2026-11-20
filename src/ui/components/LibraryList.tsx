import React, { ReactElement, memo, useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { FlashList, ListRenderItemInfo } from '@shopify/flash-list';
import { ContentStatus, LibraryEntry, RemoteAction, RemoteTrack } from '../../data/types';
import { Space } from '../tokens';
import { LibraryEntryKind, isCurrentEntry } from '../library/libraryEntryKind';
import { LibraryItem } from '../library/libraryItems';
import { LibraryListScroll } from '../library/useLibraryListScroll';
import { LIBRARY_VIEWABILITY_CONFIG, useLibraryPaging } from '../library/useLibraryPaging';
import { VisibleLibraryArtworkContext } from '../library/visibleLibraryArtwork';
import { AlbumTileRow } from './AlbumTileRow';
import { LibraryEntryRow } from './LibraryEntryRow';
import { DragReorderCell } from './DragReorderCell';
import { SwipeActionRow } from './SwipeActionRow';
import { SongSwipe } from '../library/useSongSwipe';
import { SectionHeader } from './SectionHeader';
import { Spinner } from './Spinner';
import { unclippedScroll } from '../unclippedScroll';
import { useStableTrack } from '../useStableTrack';

const END_REACHED_THRESHOLD = 1.5;
const NO_POSITION_KEEPING = { disabled: true };
const SCROLL_EVENT_THROTTLE = 16;
const LETTER_HEADER_MIN_HEIGHT = 36;
const LETTER_HEADER_RIGHT = 28;

export interface LibraryListProps {
  items: LibraryItem[];
  onAction: (action: RemoteAction) => void;
  onOpenEntry: (entry: LibraryEntry, kind: LibraryEntryKind) => void;
  onEntryLongPress?: (entry: LibraryEntry, kind: LibraryEntryKind) => void;
  renderPlaylistTrack?: (entry: LibraryEntry, index: number) => ReactElement;
  hasMore: boolean;
  status: ContentStatus;
  currentTrack?: RemoteTrack | null;
  isPlaying: boolean;
  tileWidth: number;
  stickyHeaderIndices?: number[];
  contentBottomInset: number;
  entryInsetRight?: number;
  scroll?: LibraryListScroll;
  scrollEnabled?: boolean;
  selectionMode?: boolean;
  selectedIds?: ReadonlySet<string>;
  onSelectEntry?: (entry: LibraryEntry, kind: LibraryEntryKind) => void;
  onEntrySelectionLongPress?: (entry: LibraryEntry, kind: LibraryEntryKind) => void;
  /** Swipe actions for song rows; omitted where rows shouldn't swipe (selection, playlist editing). */
  songSwipe?: SongSwipe | null;
}

function keyOf(item: LibraryItem): string {
  return item.key;
}

// Recycled views are reused only for rows of the same shape; header nodes are one-offs.
function itemTypeOf(item: LibraryItem): string {
  switch (item.type) {
    case 'node':
      return `node:${item.key}`;
    case 'entry':
      return `entry:${item.kind}`;
    default:
      return item.type;
  }
}

function withSwipe(swipe: SongSwipe, entry: LibraryEntry, row: ReactElement): ReactElement {
  return (
    <SwipeActionRow right={swipe.right} left={swipe.left} onSwipe={(direction) => swipe.onSwipe(entry, direction)}>
      {row}
    </SwipeActionRow>
  );
}

function LibraryListContent(props: LibraryListProps) {
  const view = useLibraryListView(props);
  return renderLibraryList(props, view);
}

function useLibraryListView({
  items, onAction, onOpenEntry, hasMore, status, currentTrack, contentBottomInset,
  entryInsetRight, selectionMode = false, onSelectEntry, onEntrySelectionLongPress, songSwipe, ...rowProps
}: LibraryListProps) {
  const { onEndReached, onViewableItemsChanged, visibleArtwork } = useLibraryPaging({ items, hasMore, status, onAction });
  const showMoreSongs = useCallback(
    (entry: LibraryEntry) => onAction({ type: 'OpenSongActions', id: entry.id }),
    [onAction],
  );
  // Tile callbacks stay stable across renders so memoized rows only re-render when their own props change.
  const pressTile = useCallback(
    (entry: LibraryEntry) => (selectionMode ? onSelectEntry?.(entry, 'album') : onOpenEntry(entry, 'album')),
    [onOpenEntry, onSelectEntry, selectionMode],
  );
  const longPressTile = useCallback(
    (entry: LibraryEntry) => onEntrySelectionLongPress?.(entry, 'album'),
    [onEntrySelectionLongPress],
  );
  const hasEntries = useMemo(() => items.some((item) => item.type !== 'node' && item.type !== 'letter'), [items]);
  const loadingMore = status === ContentStatus.Loading && hasEntries;
  const insetStyle = useMemo(
    () => (entryInsetRight ? { paddingRight: entryInsetRight } : undefined),
    [entryInsetRight],
  );
  const currentSong = useStableTrack(currentTrack);
  const contentContainerStyle = useMemo(() => ({ paddingBottom: contentBottomInset }), [contentBottomInset]);

  const swipe = selectionMode ? null : songSwipe ?? null;
  const renderItem = useLibraryItemRenderer({
    ...rowProps, selectionMode, onOpenEntry, onSelectEntry,
  }, { swipe, currentSong, insetStyle, showMoreSongs, pressTile, longPressTile });
  return { onEndReached, onViewableItemsChanged, visibleArtwork, loadingMore, contentContainerStyle, renderItem };
}

interface RowRendererView {
  swipe: SongSwipe | null;
  currentSong: ReturnType<typeof useStableTrack>;
  insetStyle?: { paddingRight: number };
  showMoreSongs: (entry: LibraryEntry) => void;
  pressTile: (entry: LibraryEntry) => void;
  longPressTile: (entry: LibraryEntry) => void;
}

function useLibraryItemRenderer(
  { tileWidth, renderPlaylistTrack, isPlaying, onOpenEntry, onEntryLongPress, selectionMode = false, selectedIds, onSelectEntry }:
    Pick<LibraryListProps, 'tileWidth' | 'renderPlaylistTrack' | 'isPlaying' | 'onOpenEntry' | 'onEntryLongPress' | 'selectionMode' | 'selectedIds' | 'onSelectEntry'>,
  { swipe, currentSong, insetStyle, showMoreSongs, pressTile, longPressTile }: RowRendererView,
) {
  const renderItem = useCallback(({ item }: ListRenderItemInfo<LibraryItem>) => {
    switch (item.type) {
      case 'node':
        return item.node;
      case 'tiles':
        return (
          <AlbumTileRow
            entries={item.entries}
            tileWidth={tileWidth}
            onPress={pressTile}
            selectionMode={selectionMode}
            selectedIds={selectionMode ? selectedIds : undefined}
            onLongPress={longPressTile}
          />
        );
      case 'letter':
        return (
          <SectionHeader
            label={item.letter}
            style={styles.letter}
          />
        );
      case 'playlistTrack': {
        const row = renderPlaylistTrack ? renderPlaylistTrack(item.entry, item.index) : null;
        return row && swipe ? withSwipe(swipe, item.entry, row) : row;
      }
      case 'entry':
        return renderLibraryEntry(item, { currentSong, isPlaying, insetStyle, onOpenEntry, onEntryLongPress,
          showMoreSongs, selectionMode, selectedIds, onSelectEntry, swipe });
    }
  }, [
    tileWidth,
    pressTile,
    longPressTile,
    renderPlaylistTrack,
    currentSong,
    isPlaying,
    insetStyle,
    onOpenEntry,
    onEntryLongPress,
    selectionMode,
    selectedIds,
    onSelectEntry,
    showMoreSongs,
    swipe,
  ]);

  return renderItem;
}

interface LibraryEntryView extends Pick<LibraryListProps, 'isPlaying' | 'onOpenEntry' | 'onEntryLongPress' | 'selectionMode' | 'selectedIds' | 'onSelectEntry'> {
  currentSong: RowRendererView['currentSong'];
  insetStyle: RowRendererView['insetStyle'];
  showMoreSongs: RowRendererView['showMoreSongs'];
  swipe: RowRendererView['swipe'];
}

function renderLibraryEntry(
  item: Extract<LibraryItem, { type: 'entry' }>,
  { currentSong, isPlaying, insetStyle, onOpenEntry, onEntryLongPress, showMoreSongs, selectionMode = false, selectedIds, onSelectEntry, swipe }: LibraryEntryView,
) {
  const current = isCurrentEntry(item.entry, currentSong);
  const row = (
    <View style={insetStyle}>
      <LibraryEntryRow
        entry={item.entry}
        kind={item.kind}
        number={item.number}
        current={current}
        playing={current && isPlaying}
        onPress={onOpenEntry}
        onLongPress={onEntryLongPress}
        onMore={item.kind === 'song' ? showMoreSongs : undefined}
        selectionMode={selectionMode}
        selected={selectionMode && Boolean(selectedIds?.has(item.entry.id))}
        onSelect={onSelectEntry}
      />
    </View>
  );
  return swipe && item.kind === 'song' ? withSwipe(swipe, item.entry, row) : row;
}

function renderLibraryList(
  { items, scroll, stickyHeaderIndices, renderPlaylistTrack, scrollEnabled = true }: LibraryListProps,
  { onEndReached, onViewableItemsChanged, visibleArtwork, loadingMore, contentContainerStyle, renderItem }: ReturnType<typeof useLibraryListView>,
) {
  const listRef = scroll?.listRef;
  return (
    <VisibleLibraryArtworkContext.Provider value={visibleArtwork}>
      <FlashList
        ref={listRef}
        getItemType={itemTypeOf}
        maintainVisibleContentPosition={NO_POSITION_KEEPING}
        style={unclippedScroll}
        data={items}
        keyExtractor={keyOf}
        renderItem={renderItem}
        CellRendererComponent={renderPlaylistTrack ? DragReorderCell : undefined}
        stickyHeaderIndices={stickyHeaderIndices}
        onEndReached={onEndReached}
        onEndReachedThreshold={END_REACHED_THRESHOLD}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={LIBRARY_VIEWABILITY_CONFIG}
        onScroll={scroll?.onScroll}
        onContentSizeChange={scroll?.onContentSizeChange}
        scrollEventThrottle={SCROLL_EVENT_THROTTLE}
        scrollEnabled={scrollEnabled}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={contentContainerStyle}
        ListFooterComponent={loadingMore ? loadingFooter : null}
      />
    </VisibleLibraryArtworkContext.Provider>
  );
}

export const LibraryList = memo(LibraryListContent);

const styles = StyleSheet.create({
  footer: {
    alignItems: 'center',
    paddingVertical: Space.lg,
  },
  letter: {
    minHeight: LETTER_HEADER_MIN_HEIGHT,
    paddingTop: Space.md,
    paddingBottom: Space.xs,
    paddingRight: LETTER_HEADER_RIGHT,
  },
});

const loadingFooter = (
  <View style={styles.footer}>
    <Spinner />
  </View>
);
