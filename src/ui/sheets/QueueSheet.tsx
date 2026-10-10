import React, { useEffect, useRef, useState } from 'react';
import { FlatList, ListRenderItem, StyleSheet, View } from 'react-native';
import { ContentStatus, PlaybackMode, RemoteAction, RemoteTrack, RemoteUiState } from '../../data/types';
import { AppText } from '../components/AppText';
import { BottomSheet } from '../components/BottomSheet';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { IconButton } from '../components/IconButton';
import { InlineError } from '../components/InlineError';
import { QueueNowPlayingCard } from '../components/QueueNowPlayingCard';
import { DragHandle } from '../components/DragHandle';
import { DragReorderCell } from '../components/DragReorderCell';
import { DragReorderCellContext } from '../components/dragReorderCellContext';
import { RemovableRow, RemovableRowHandle } from '../components/RemovableRow';
import { SectionHeader } from '../components/SectionHeader';
import { Spinner } from '../components/Spinner';
import { TrackRow } from '../components/TrackRow';
import { usePalette } from '../PaletteProvider';
import { Durations } from '../motion';
import { useSnackbar } from '../snackbar/useSnackbar';
import { Space } from '../tokens';
import { useDragReorder } from '../useDragReorder';
import { useQueueReorder } from '../useQueueReorder';

export interface QueueSheetProps {
  state: RemoteUiState;
  onAction: (action: RemoteAction) => void;
  visible: boolean;
  onClose: () => void;
}

const QUEUE_ROW_ARTWORK = 40;
const MODE_ICON_SIZE = 18;
const END_REACHED_THRESHOLD = 0.5;
const QUEUE_ROW_HEIGHT = 56;

let removeHintShown = false;

function songCount(count: number): string {
  return `${count} ${count === 1 ? 'song' : 'songs'}`;
}

function repeatLabel(mode: PlaybackMode): string {
  if (mode === PlaybackMode.RepeatAll) return 'Repeat';
  if (mode === PlaybackMode.RepeatOne) return 'Repeat once';
  return 'Repeat off';
}

function trackSubtitle(track: RemoteTrack): string {
  const artist = track.artist || 'Unknown artist';
  return track.duration ? `${artist} · ${track.duration}` : artist;
}

export function QueueSheet({ state, onAction, visible, onClose }: QueueSheetProps) {
  const palette = usePalette();
  const snackbar = useSnackbar();
  const [confirmingClear, setConfirmingClear] = useState(false);
  const lastPageRequest = useRef('');
  const firstRow = useRef<RemovableRowHandle | null>(null);
  const canEditQueue = state.supportedFeatures.includes('queue_edit');
  const reorder = useQueueReorder(state.queue, onAction, ({ track, from, to }) =>
    snackbar.show({ text: `Moved “${track.title}”`, actionLabel: 'Undo', onAction: () => reorder.move(to, from) }),
  );
  const rows = reorder.queue;
  const drag = useDragReorder({
    itemCount: rows.length,
    rowHeight: QUEUE_ROW_HEIGHT,
    enabled: visible && canEditQueue && !reorder.moving,
    onMove: reorder.move,
  });
  const hasRows = rows.length > 0;

  useEffect(() => {
    if (!visible || removeHintShown) return;
    const timer = setTimeout(() => {
      if (!firstRow.current) return;
      removeHintShown = true;
      firstRow.current.peek();
    }, Durations.peekDelay);
    return () => clearTimeout(timer);
  }, [visible, hasRows]);
  const queueCount = Math.max(state.queueTotal, state.queue.length);
  const shuffleOn = state.playbackMode === PlaybackMode.Shuffle;
  const repeatOn = state.playbackMode === PlaybackMode.RepeatAll || state.playbackMode === PlaybackMode.RepeatOne;

  const loadMore = () => {
    const key = `${state.queue.length}:${state.queueTotal}`;
    if (!state.queueHasMore || state.queueLoadingMore || lastPageRequest.current === key) return;
    lastPageRequest.current = key;
    onAction({ type: 'LoadMoreQueue' });
  };

  const confirmClear = () => {
    setConfirmingClear(false);
    onAction({ type: 'ClearQueue' });
    onClose();
  };

  const removeTrack = (track: RemoteTrack) => {
    onAction({ type: 'RemoveQueueTrack', id: track.id });
    snackbar.show({ text: `Removed “${track.title}”` });
  };

  const renderTrack: ListRenderItem<RemoteTrack> = ({ item, index }) => {
    const play = canEditQueue ? () => onAction({ type: 'PlayQueueTrack', id: item.id }) : undefined;
    return (
      <RemovableRow
        ref={index === 0 ? firstRow : undefined}
        rowHeight={QUEUE_ROW_HEIGHT}
        swipeToRemove
        accessibilityLabel={`${item.title}, ${trackSubtitle(item)}`}
        removeLabel="Remove"
        onRemove={() => removeTrack(item)}
        onTap={play}
        contentBackground={drag.draggingIndex === index ? palette.surfaceRaised : undefined}
      >
        <TrackRow
          title={item.title || 'Unknown song'}
          subtitle={trackSubtitle(item)}
          artworkUri={item.artwork}
          artworkSize={QUEUE_ROW_ARTWORK}
          onPress={play}
          accessory={canEditQueue ? <DragHandle handle={drag.handleProps(index)} /> : undefined}
        />
      </RemovableRow>
    );
  };

  const emptyState =
    state.queueStatus === ContentStatus.Loading ? (
      <View style={styles.message}>
        <Spinner />
        <AppText tone="inkMuted">Loading queue…</AppText>
      </View>
    ) : state.queueStatus === ContentStatus.Error ? (
      <View style={styles.message}>
        <AppText tone="inkMuted" style={styles.centered}>
          Couldn't load the queue.
        </AppText>
      </View>
    ) : (
      <View style={styles.message}>
        <AppText tone="inkMuted" style={styles.centered}>
          Nothing else is queued. Add songs from their menu in the Library.
        </AppText>
      </View>
    );

  const footer = state.queueLoadingMore ? (
    <View style={styles.footer}>
      <Spinner />
    </View>
  ) : hasRows && !state.queueHasMore ? (
    <AppText variant="caption" tone="inkMuted" style={[styles.footer, styles.centered]}>
      End of queue
    </AppText>
  ) : null;

  return (
    <BottomSheet visible={visible} onClose={onClose} fullHeight scrollable={false}>
      <View style={styles.header}>
        <View style={styles.headerTitles}>
          <AppText variant="title" accessibilityRole="header">
            Queue
          </AppText>
          <AppText variant="caption" tone="inkMuted" tabular>
            {`${songCount(queueCount)} up next`}
          </AppText>
        </View>
        <IconButton
          icon="shuffle"
          label="Shuffle"
          size="sm"
          iconSize={MODE_ICON_SIZE}
          active={shuffleOn}
          onPress={() => onAction({ type: 'ToggleShuffle' })}
        />
        <IconButton
          icon={state.playbackMode === PlaybackMode.RepeatOne ? 'repeatOne' : 'repeat'}
          label={repeatLabel(state.playbackMode)}
          size="sm"
          iconSize={MODE_ICON_SIZE}
          active={repeatOn}
          onPress={() => onAction({ type: 'CycleRepeatMode' })}
        />
        <Button
          label="Clear"
          variant="plain"
          accessibilityLabel="Clear queue"
          disabled={queueCount === 0}
          onPress={() => setConfirmingClear(true)}
        />
      </View>
      {state.currentTrack ? (
        <QueueNowPlayingCard
          track={state.currentTrack}
          isPlaying={state.isPlaying}
          positionMs={state.positionMs}
          style={styles.nowPlaying}
        />
      ) : null}
      {state.connectionMessage ? (
        <InlineError message={state.connectionMessage} style={styles.error} />
      ) : null}
      <SectionHeader
        label="Up next"
        tone="muted"
        caption={hasRows ? (canEditQueue ? 'Drag ≡ to reorder · swipe left to remove' : 'Swipe left to remove') : undefined}
        style={styles.sectionHeader}
      />
      <DragReorderCellContext.Provider value={drag.rowStyle}>
        <FlatList
          data={rows}
          extraData={drag.draggingIndex}
          CellRendererComponent={DragReorderCell}
          scrollEnabled={drag.scrollEnabled}
          keyExtractor={(track) => track.id}
          renderItem={renderTrack}
          ListEmptyComponent={emptyState}
          ListFooterComponent={footer}
          onEndReached={loadMore}
          onEndReachedThreshold={END_REACHED_THRESHOLD}
          showsVerticalScrollIndicator={false}
          style={[styles.list, { backgroundColor: palette.surface }]}
        />
      </DragReorderCellContext.Provider>
      <ConfirmDialog
        visible={confirmingClear}
        title="Clear the queue?"
        message={`This removes all ${songCount(queueCount)} from the queue on the player.`}
        confirmLabel="Clear queue"
        destructive
        onConfirm={confirmClear}
        onClose={() => setConfirmingClear(false)}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingLeft: Space.lg,
    paddingRight: Space.sm,
    paddingBottom: Space.md,
  },
  headerTitles: {
    flex: 1,
    minWidth: 0,
  },
  nowPlaying: {
    marginHorizontal: Space.lg,
    marginBottom: Space.md,
  },
  error: {
    marginHorizontal: Space.lg,
    marginBottom: Space.sm,
  },
  sectionHeader: {
    paddingRight: Space.lg,
  },
  list: {
    flex: 1,
  },
  message: {
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.xl + Space.sm,
    paddingHorizontal: Space.xl,
  },
  centered: {
    textAlign: 'center',
  },
  footer: {
    padding: Space.lg,
    alignItems: 'center',
  },
});
