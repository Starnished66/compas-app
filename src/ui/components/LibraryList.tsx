import React, { ReactElement, memo, useCallback, useMemo } from 'react';
import { FlatList, ListRenderItemInfo, StyleSheet, View } from 'react-native';
import { ContentStatus, LibraryEntry, RemoteAction, RemoteTrack } from '../../data/types';
import { Space } from '../tokens';
import { LibraryEntryKind, isCurrentEntry } from '../library/libraryEntryKind';
import { LibraryItem } from '../library/libraryItems';
import { LibraryListScroll } from '../library/useLibraryListScroll';
import { LIBRARY_VIEWABILITY_CONFIG, useLibraryPaging } from '../library/useLibraryPaging';
import { AlbumTileRow } from './AlbumTileRow';
import { LibraryEntryRow } from './LibraryEntryRow';
import { DragReorderCell } from './DragReorderCell';
import { SectionHeader } from './SectionHeader';
import { Spinner } from './Spinner';
import { unclippedScroll } from '../unclippedScroll';
import { useStableTrack } from '../useStableTrack';

const END_REACHED_THRESHOLD = 1.5;
const INITIAL_ROWS = 16;
const RENDER_WINDOW = 7;
const SCROLL_EVENT_THROTTLE = 16;
const LETTER_HEADER_MIN_HEIGHT = 36;
const LETTER_HEADER_RIGHT = 28;
const INDEX_RETRY_DELAY_MS = 60;

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
}

function keyOf(item: LibraryItem): string {
  return item.key;
}

function LibraryListContent({
  items,
  onAction,
  onOpenEntry,
  onEntryLongPress,
  renderPlaylistTrack,
  hasMore,
  status,
  currentTrack,
  isPlaying,
  tileWidth,
  stickyHeaderIndices,
  contentBottomInset,
  entryInsetRight,
  scroll,
  scrollEnabled = true,
}: LibraryListProps) {
  const { onEndReached, onViewableItemsChanged } = useLibraryPaging({ hasMore, status, onAction });
  const showMoreSongs = useCallback(
    (entry: LibraryEntry) => onAction({ type: 'OpenSongActions', id: entry.id }),
    [onAction],
  );
  const openTile = useCallback((entry: LibraryEntry) => onOpenEntry(entry, 'album'), [onOpenEntry]);
  const hasEntries = items.some((item) => item.type !== 'node' && item.type !== 'letter');
  const loadingMore = status === ContentStatus.Loading && hasEntries;
  const insetStyle = useMemo(
    () => (entryInsetRight ? { paddingRight: entryInsetRight } : undefined),
    [entryInsetRight],
  );
  const listRef = scroll?.listRef;
  const currentSong = useStableTrack(currentTrack);
  const contentContainerStyle = useMemo(() => ({ paddingBottom: contentBottomInset }), [contentBottomInset]);

  const onScrollToIndexFailed = useCallback(
    (info: { index: number; averageItemLength: number }) => {
      listRef?.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
      setTimeout(() => listRef?.current?.scrollToIndex({ index: info.index, animated: false }), INDEX_RETRY_DELAY_MS);
    },
    [listRef],
  );

  const renderItem = useCallback(({ item }: ListRenderItemInfo<LibraryItem>) => {
    switch (item.type) {
      case 'node':
        return item.node;
      case 'tiles':
        return <AlbumTileRow entries={item.entries} tileWidth={tileWidth} onPress={openTile} />;
      case 'letter':
        return (
          <SectionHeader
            label={item.letter}
            style={styles.letter}
          />
        );
      case 'playlistTrack':
        return renderPlaylistTrack ? renderPlaylistTrack(item.entry, item.index) : null;
      case 'entry': {
        const current = isCurrentEntry(item.entry, currentSong);
        return (
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
            />
          </View>
        );
      }
    }
  }, [
    tileWidth,
    openTile,
    renderPlaylistTrack,
    currentSong,
    isPlaying,
    insetStyle,
    onOpenEntry,
    onEntryLongPress,
    showMoreSongs,
  ]);

  return (
    <FlatList
      ref={listRef}
      style={unclippedScroll}
      data={items}
      keyExtractor={keyOf}
      renderItem={renderItem}
      strictMode
      CellRendererComponent={renderPlaylistTrack ? DragReorderCell : undefined}
      stickyHeaderIndices={stickyHeaderIndices}
      onEndReached={onEndReached}
      onEndReachedThreshold={END_REACHED_THRESHOLD}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={LIBRARY_VIEWABILITY_CONFIG}
      onScroll={scroll?.onScroll}
      onContentSizeChange={scroll?.onContentSizeChange}
      onScrollToIndexFailed={onScrollToIndexFailed}
      scrollEventThrottle={SCROLL_EVENT_THROTTLE}
      scrollEnabled={scrollEnabled}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
      initialNumToRender={INITIAL_ROWS}
      windowSize={RENDER_WINDOW}
      contentContainerStyle={contentContainerStyle}
      ListFooterComponent={loadingMore ? loadingFooter : null}
    />
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
