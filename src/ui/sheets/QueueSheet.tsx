import React, { Ref, memo, useCallback, useEffect, useRef, useState } from 'react';
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
import { Icon } from '../components/Icon';
import { usePalette } from '../PaletteProvider';
import { Durations } from '../motion';
import { useSnackbar } from '../snackbar/useSnackbar';
import { Space } from '../tokens';
import { DragHandleProps, useDragReorder } from '../useDragReorder';
import { useQueueReorder } from '../useQueueReorder';
import { useI18n } from '../../i18n';
import { isShuffleMode } from '../../session/playbackModes';

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
const INITIAL_ROWS = 16;
const ROWS_PER_BATCH = 10;
const RENDER_WINDOW = 7;

let removeHintShown = false;

function repeatLabel(mode: PlaybackMode): string {
  if (mode === PlaybackMode.RepeatAll || mode === PlaybackMode.ShuffleRepeat) return 'Repeat';
  if (mode === PlaybackMode.RepeatOne) return 'Repeat once';
  return 'Repeat off';
}

function keyOf(track: RemoteTrack): string {
  return track.id;
}

function trackSubtitle(track: RemoteTrack, t: (source: string) => string): string {
  const artist = track.artist || t('Unknown artist');
  return track.duration ? `${artist} · ${track.duration}` : artist;
}

interface QueueRowProps {
  track: RemoteTrack;
  selecting: boolean;
  selected: boolean;
  lifted: boolean;
  removable: boolean;
  dragHandle?: DragHandleProps;
  rowRef?: Ref<RemovableRowHandle>;
  onPlay: (track: RemoteTrack) => void;
  onToggleSelected: (track: RemoteTrack) => void;
  onBeginSelecting: (track: RemoteTrack) => void;
  onRemove: (track: RemoteTrack) => void;
}

// Memoized so selection, drag and page loads re-render only the rows whose own props changed.
const QueueRow = memo(function QueueRow({
  track,
  selecting,
  selected,
  lifted,
  removable,
  dragHandle,
  rowRef,
  onPlay,
  onToggleSelected,
  onBeginSelecting,
  onRemove,
}: QueueRowProps) {
  const { t } = useI18n();
  const palette = usePalette();
  const title = track.title || t('Unknown song');
  const subtitle = trackSubtitle(track, t);
  if (selecting) {
    return (
      <TrackRow
        title={title}
        subtitle={subtitle}
        artworkUri={track.artwork}
        artworkSize={QUEUE_ROW_ARTWORK}
        selected={selected}
        onPress={() => onToggleSelected(track)}
        onLongPress={() => onToggleSelected(track)}
        accessory={<Icon name={selected ? 'check' : 'selectionCircle'} color={selected ? palette.accent : palette.inkMuted} />}
      />
    );
  }
  const play = () => onPlay(track);
  return (
    <RemovableRow
      ref={rowRef}
      rowHeight={QUEUE_ROW_HEIGHT}
      swipeToRemove={removable}
      accessibilityLabel={`${track.title}, ${subtitle}`}
      removeLabel={t('Remove')}
      onRemove={() => onRemove(track)}
      onTap={play}
      contentBackground={lifted ? palette.surfaceRaised : undefined}
    >
      <TrackRow
        title={title}
        subtitle={subtitle}
        artworkUri={track.artwork}
        artworkSize={QUEUE_ROW_ARTWORK}
        onPress={play}
        onLongPress={() => onBeginSelecting(track)}
        accessory={dragHandle ? <DragHandle handle={dragHandle} /> : undefined}
      />
    </RemovableRow>
  );
});

export function QueueSheet({ state, onAction, visible, onClose }: QueueSheetProps) {
  const { t } = useI18n();
  const palette = usePalette();
  const snackbar = useSnackbar();
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dismissedBulkStatus, setDismissedBulkStatus] = useState(false);
  const selecting = selectedIds.size > 0;
  useEffect(() => { if (!visible) setSelectedIds(new Set()); }, [visible]);
  const lastPageRequest = useRef('');
  const firstRow = useRef<RemovableRowHandle | null>(null);
  const canEditQueue = state.supportedFeatures.includes('queue_edit');
  const queueRemovalRunning = state.bulkActionProgress?.action === 'queueRemove' && state.bulkActionProgress.phase === 'writing';
  const bulkJobRunning = state.bulkActionProgress?.phase === 'resolving' || state.bulkActionProgress?.phase === 'writing';
  const queueRemovalFinished = state.bulkActionProgress?.action === 'queueRemove' && !queueRemovalRunning && !dismissedBulkStatus;
  useEffect(() => { if (queueRemovalRunning) setDismissedBulkStatus(false); }, [queueRemovalRunning]);
  const reorder = useQueueReorder(state.queue, onAction, ({ track, from, to }) =>
    snackbar.show({ text: t('Moved “{title}”', { title: track.title }), actionLabel: t('Undo'), onAction: () => reorder.move(to, from) }),
  );
  const rows = reorder.queue;
  const drag = useDragReorder({
    itemCount: rows.length,
    rowHeight: QUEUE_ROW_HEIGHT,
    enabled: visible && canEditQueue && !reorder.moving && !selecting && !bulkJobRunning,
    onMove: reorder.move,
  });
  const hasRows = rows.length > 0;

  useEffect(() => {
    if (!visible || removeHintShown || !canEditQueue) return;
    const timer = setTimeout(() => {
      if (!firstRow.current) return;
      removeHintShown = true;
      firstRow.current.peek();
    }, Durations.peekDelay);
    return () => clearTimeout(timer);
  }, [visible, hasRows, canEditQueue]);
  const queueCount = Math.max(state.queueTotal, state.queue.length);
  const shuffleOn = isShuffleMode(state.playbackMode);
  const repeatOn = state.playbackMode === PlaybackMode.RepeatAll || state.playbackMode === PlaybackMode.RepeatOne || state.playbackMode === PlaybackMode.ShuffleRepeat;

  const loadMore = () => {
    const key = `${state.queue.length}:${state.queueTotal}`;
    if (!state.queueHasMore || state.queueLoadingMore || lastPageRequest.current === key) return;
    lastPageRequest.current = key;
    onAction({ type: 'LoadMoreQueue' });
  };

  const confirmClear = () => {
    setConfirmingClear(false);
    if (bulkJobRunning) return;
    onAction({ type: 'ClearQueue' });
    onClose();
  };
  const close = () => {
    if (queueRemovalRunning) onAction({ type: 'CancelBulkAction' });
    onClose();
  };

  const latest = useRef({ onAction, snackbar, t, canEditQueue, bulkJobRunning });
  latest.current = { onAction, snackbar, t, canEditQueue, bulkJobRunning };

  const removeTrack = useCallback((track: RemoteTrack) => {
    const current = latest.current;
    if (current.bulkJobRunning) return;
    current.onAction({ type: 'RemoveQueueTrack', id: track.id });
    current.snackbar.show({ text: current.t('Removed “{title}”', { title: track.title }) });
  }, []);

  // Same feedback as Home's Up next when the player can't jump within its queue.
  const playTrack = useCallback((track: RemoteTrack) => {
    const current = latest.current;
    if (current.bulkJobRunning) return;
    if (!current.canEditQueue) {
      current.snackbar.show({ text: current.t('This player can’t jump to a song in the queue.') });
      return;
    }
    current.onAction({ type: 'PlayQueueTrack', id: track.id });
  }, []);

  const toggleSelected = useCallback((track: RemoteTrack) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(track.id)) next.delete(track.id);
      else next.add(track.id);
      return next;
    });
  }, []);
  const beginSelecting = useCallback((track: RemoteTrack) => setSelectedIds((previous) => new Set(previous).add(track.id)), []);
  const removeSelected = () => {
    if (!selectedIds.size || bulkJobRunning) return;
    onAction({ type: 'RemoveQueueTracks', ids: [...selectedIds] });
    setSelectedIds(new Set());
  };

  const { draggingIndex, handleProps } = drag;
  const renderTrack: ListRenderItem<RemoteTrack> = useCallback(({ item, index }) => (
    <QueueRow
      track={item}
      selecting={selecting}
      selected={selecting && selectedIds.has(item.id)}
      lifted={draggingIndex === index}
      removable={canEditQueue && !bulkJobRunning}
      dragHandle={canEditQueue ? handleProps(index) : undefined}
      rowRef={index === 0 ? firstRow : undefined}
      onPlay={playTrack}
      onToggleSelected={toggleSelected}
      onBeginSelecting={beginSelecting}
      onRemove={removeTrack}
    />
  ), [bulkJobRunning, canEditQueue, draggingIndex, handleProps, playTrack, removeTrack, selecting, selectedIds, toggleSelected, beginSelecting]);

  const emptyState =
    state.queueStatus === ContentStatus.Loading ? (
      <View style={styles.message}>
        <Spinner />
        <AppText tone="inkMuted">{t('Loading queue…')}</AppText>
      </View>
    ) : state.queueStatus === ContentStatus.Error ? (
      <View style={styles.message}>
        <AppText tone="inkMuted" style={styles.centered}>
          {t('Couldn’t load the queue.')}
        </AppText>
      </View>
    ) : (
      <View style={styles.message}>
        <AppText tone="inkMuted" style={styles.centered}>
          {t('Nothing else is queued. Add songs from their menu in the Library.')}
        </AppText>
      </View>
    );

  const footer = state.queueLoadingMore ? (
    <View style={styles.footer}>
      <Spinner />
    </View>
  ) : hasRows && !state.queueHasMore ? (
    <AppText variant="caption" tone="inkMuted" style={[styles.footer, styles.centered]}>
      {t('End of queue')}
    </AppText>
  ) : null;

  return (
    <BottomSheet
      visible={visible}
      onClose={close}
      onBackPress={() => {
        if (!selecting) return false;
        setSelectedIds(new Set());
        return true;
      }}
      fullHeight
      scrollable={false}
    >
      <View style={styles.header}>
        <View style={styles.headerTitles}>
          <AppText variant="title" accessibilityRole="header">
            {t('Queue')}
          </AppText>
          <AppText variant="caption" tone="inkMuted" tabular>
            {t('{count} songs up next', { count: queueCount })}
          </AppText>
        </View>
        <IconButton
          icon="shuffle"
          label={t('Shuffle')}
          size="sm"
          iconSize={MODE_ICON_SIZE}
          active={shuffleOn}
          onPress={() => onAction({ type: 'ToggleShuffle' })}
          disabled={bulkJobRunning}
        />
        <IconButton
          icon={state.playbackMode === PlaybackMode.RepeatOne ? 'repeatOne' : 'repeat'}
          label={t(repeatLabel(state.playbackMode))}
          size="sm"
          iconSize={MODE_ICON_SIZE}
          active={repeatOn}
          onPress={() => onAction({ type: 'CycleRepeatMode' })}
          disabled={bulkJobRunning}
        />
        {selecting ? (
          <>
            <AppText variant="caption" tone="inkMuted">{t('{count} selected', { count: selectedIds.size })}</AppText>
            <Button label={t('Remove')} variant="destructive" disabled={!canEditQueue || bulkJobRunning} onPress={removeSelected} />
            <Button label={t('Cancel')} variant="plain" onPress={() => setSelectedIds(new Set())} />
          </>
        ) : (
          <Button
            label={t('Clear')}
            variant="plain"
            accessibilityLabel={t('Clear queue')}
            disabled={queueCount === 0 || bulkJobRunning}
            onPress={() => setConfirmingClear(true)}
          />
        )}
      </View>
      {queueRemovalRunning ? <View style={styles.progress}><AppText>{t('{completed} of {total} processed', { completed: state.bulkActionProgress?.completed ?? 0, total: state.bulkActionProgress?.total ?? 0 })}</AppText><Button label={t('Stop')} variant="plain" onPress={() => onAction({ type: 'CancelBulkAction' })} /></View> : null}
      {queueRemovalFinished ? <View style={styles.progress}><AppText>{state.bulkActionProgress?.message ? t(state.bulkActionProgress.message, state.bulkActionProgress.messageValues) : null}</AppText><Button label={t('Done')} variant="plain" onPress={() => setDismissedBulkStatus(true)} /></View> : null}
      {state.currentTrack ? (
        <QueueNowPlayingCard
          track={state.currentTrack}
          isPlaying={state.isPlaying}
          style={styles.nowPlaying}
        />
      ) : null}
      {state.connectionMessage ? (
        <InlineError message={state.connectionMessage} style={styles.error} />
      ) : null}
      <SectionHeader
        label={t('Up next')}
        tone="muted"
        caption={hasRows && canEditQueue ? t('Drag ≡ to reorder · swipe left to remove') : undefined}
        style={styles.sectionHeader}
      />
      <DragReorderCellContext.Provider value={drag.rowStyle}>
        <FlatList
          data={rows}
          CellRendererComponent={DragReorderCell}
          scrollEnabled={drag.scrollEnabled}
          keyExtractor={keyOf}
          renderItem={renderTrack}
          strictMode
          ListEmptyComponent={emptyState}
          ListFooterComponent={footer}
          onEndReached={loadMore}
          onEndReachedThreshold={END_REACHED_THRESHOLD}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={false}
          initialNumToRender={INITIAL_ROWS}
          maxToRenderPerBatch={ROWS_PER_BATCH}
          windowSize={RENDER_WINDOW}
          style={[styles.list, { backgroundColor: palette.surface }]}
        />
      </DragReorderCellContext.Provider>
      <ConfirmDialog
        visible={confirmingClear}
        title={t('Clear the queue?')}
        message={t('This removes all {count} songs from the queue on the player.', { count: queueCount })}
        confirmLabel={t('Clear queue')}
        destructive
        onConfirm={confirmClear}
        onClose={() => setConfirmingClear(false)}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  progress: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Space.lg, paddingVertical: Space.sm },
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
