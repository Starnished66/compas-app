import React, { forwardRef, useCallback, useEffect, useState } from 'react';
import { FlatList, ListRenderItem, ScrollViewProps, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { RemoteAction, RemoteTrack, RemoteUiState } from '../../data/types';
import { songCount } from '../countLabels';
import { Space } from '../tokens';
import { sameSong } from '../trackKey';
import { useUpNextQueue } from '../useUpNextQueue';
import { CardSection } from './CardSection';
import { DragReorderCell } from './DragReorderCell';
import { DragReorderCellContext } from './dragReorderCellContext';
import { SectionHeader } from './SectionHeader';
import { UpNextFooter } from './UpNextFooter';
import { UpNextListItem } from './UpNextListItem';
import { UP_NEXT_ROW_HEIGHT } from './UpNextRow';
import { unclippedScroll } from '../unclippedScroll';
import { useStableTrack } from '../useStableTrack';

export interface UpNextListProps {
  state: RemoteUiState;
  onAction: (action: RemoteAction) => void;
  editing: boolean;
  onToggleEditing: () => void;
  onReorderActiveChange?: (active: boolean) => void;
  onCardHeightChange?: (height: number) => void;
  scrollProps?: ScrollViewProps;
}

const INITIAL_ROWS = 12;
const ROWS_PER_BATCH = 10;
const RENDER_WINDOW = 5;

const ScrollLinkedFlatList = Animated.createAnimatedComponent(FlatList) as unknown as typeof FlatList;

function keyOf(track: RemoteTrack): string {
  return track.id;
}

export const UpNextList = forwardRef<FlatList<RemoteTrack>, UpNextListProps>(function UpNextList(
  { state, onAction, editing, onToggleEditing, onReorderActiveChange, onCardHeightChange, scrollProps },
  ref,
) {
  const queue = useUpNextQueue(state, onAction, editing, UP_NEXT_ROW_HEIGHT, onReorderActiveChange);
  const { rows, drag, canEditQueue, playTrack, removeTrack } = queue;
  const [headerHeight, setHeaderHeight] = useState(0);
  const [footerHeight, setFooterHeight] = useState(0);
  const hasRows = rows.length > 0;
  const total = Math.max(state.queueTotal, state.queue.length);
  const currentTrack = useStableTrack(state.currentTrack);
  const playing = state.isPlaying;
  const { draggingIndex, handleProps } = drag;
  const cardHeight = headerHeight + footerHeight + rows.length * UP_NEXT_ROW_HEIGHT;

  useEffect(() => onCardHeightChange?.(cardHeight), [cardHeight, onCardHeightChange]);

  const renderItem: ListRenderItem<RemoteTrack> = useCallback(
    ({ item, index }) => {
      const current = sameSong(item, currentTrack);
      return (
        <UpNextListItem
          track={item}
          index={index}
          editing={editing}
          current={current}
          playing={current && playing}
          lifted={draggingIndex === index}
          dragHandle={canEditQueue ? handleProps(index) : undefined}
          onPlay={playTrack}
          onRemove={removeTrack}
        />
      );
    },
    [canEditQueue, currentTrack, draggingIndex, editing, handleProps, playTrack, playing, removeTrack],
  );

  return (
    <DragReorderCellContext.Provider value={drag.rowStyle}>
      <ScrollLinkedFlatList
        {...scrollProps}
        ref={ref}
        style={unclippedScroll}
        data={rows}
        keyExtractor={keyOf}
        renderItem={renderItem}
        strictMode
        CellRendererComponent={DragReorderCell}
        initialNumToRender={INITIAL_ROWS}
        maxToRenderPerBatch={ROWS_PER_BATCH}
        windowSize={RENDER_WINDOW}
        ListHeaderComponent={
          <CardSection
            edge="top"
            style={styles.header}
            onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}
          >
            <SectionHeader
              label="Up next"
              caption={hasRows || total > 0 ? songCount(total) : undefined}
              actionLabel={hasRows ? (editing ? 'Done' : 'Edit') : undefined}
              actionSelected={editing}
              onAction={onToggleEditing}
            />
          </CardSection>
        }
        ListFooterComponent={
          <UpNextFooter
            hasRows={hasRows}
            status={state.queueStatus}
            loadingMore={state.queueLoadingMore}
            hasMore={state.queueHasMore}
            onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height)}
          />
        }
      />
    </DragReorderCellContext.Provider>
  );
});

const styles = StyleSheet.create({
  header: {
    paddingTop: Space.sm,
  },
});
