import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { useDragReorder } from '../useDragReorder';
import { useQueueReorder } from '../useQueueReorder';
import { useBackInterceptor } from '../useBackInterceptor';
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

let removeHintShown = false;

function songCount(count: number): string {
  return `${count} ${count === 1 ? 'song' : 'songs'}`;
}

function repeatLabel(mode: PlaybackMode): string {
  if (mode === PlaybackMode.RepeatAll || mode === PlaybackMode.ShuffleRepeat) return 'Repeat';
  if (mode === PlaybackMode.RepeatOne) return 'Repeat once';
  return 'Repeat off';
}

function keyOf(track: RemoteTrack): string {
  return track.id;
}

function trackSubtitle(track: RemoteTrack): string {
  const artist = track.artist || 'Unknown artist';
  return track.duration ? `${artist} · ${track.duration}` : artist;
}

export function QueueSheet({ state, onAction, visible, onClose }: QueueSheetProps) {
  const { t } = useI18n();
  const palette = usePalette();
  const snackbar = useSnackbar();
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dismissedBulkStatus, setDismissedBulkStatus] = useState(false);
  const selecting = selectedIds.size > 0;
  useBackInterceptor(visible && selecting, () => setSelectedIds(new Set()));
  useEffect(() => { if (!visible) setSelectedIds(new Set()); }, [visible]);
  const lastPageRequest = useRef('');
  const firstRow = useRef<RemovableRowHandle | null>(null);
  const canEditQueue = state.supportedFeatures.includes('queue_edit');
  const queueRemovalRunning = state.bulkActionProgress?.action === 'queueRemove' && state.bulkActionProgress.phase === 'writing';
  const bulkJobRunning = state.bulkActionProgress?.phase === 'resolving' || state.bulkActionProgress?.phase === 'writing';
  const queueRemovalFinished = state.bulkActionProgress?.action === 'queueRemove' && !queueRemovalRunning && !dismissedBulkStatus;
  useEffect(() => { if (queueRemovalRunning) setDismissedBulkStatus(false); }, [queueRemovalRunning]);
  const reorder = useQueueReorder(state.queue, onAction, ({ track, from, to }) =>
    snackbar.show({ text: `Moved “${track.title}”`, actionLabel: 'Undo', onAction: () => reorder.move(to, from) }),
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
    if (!visible || removeHintShown) return;
    const timer = setTimeout(() => {
      if (!firstRow.current) return;
      removeHintShown = true;
      firstRow.current.peek();
    }, Durations.peekDelay);
    return () => clearTimeout(timer);
  }, [visible, hasRows]);
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

  const removeTrack = useCallback((track: RemoteTrack) => {
    if (state.bulkActionProgress?.phase === 'resolving' || state.bulkActionProgress?.phase === 'writing') return;
    onAction({ type: 'RemoveQueueTrack', id: track.id });
    snackbar.show({ text: t('Removed “{title}”', { title: track.title }) });
  }, [onAction, snackbar, state.bulkActionProgress?.phase, t]);

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
  const renderTrack: ListRenderItem<RemoteTrack> = useCallback(({ item, index }) => {
    const play = selecting
      ? () => toggleSelected(item)
      : canEditQueue && !bulkJobRunning ? () => onAction({ type: 'PlayQueueTrack', id: item.id }) : undefined;
    const selectAccessory = selecting ? <Icon name={selectedIds.has(item.id) ? 'check' : 'selectionCircle'} color={selectedIds.has(item.id) ? palette.accent : palette.inkMuted} /> : undefined;
    if (selecting) {
      return (
        <TrackRow
          title={item.title || t('Unknown song')}
          subtitle={trackSubtitle(item)}
          artworkUri={item.artwork}
          artworkSize={QUEUE_ROW_ARTWORK}
          selected={selectedIds.has(item.id)}
          onPress={play}
          onLongPress={() => toggleSelected(item)}
          accessory={selectAccessory}
        />
      );
    }
    return (
      <RemovableRow
        ref={index === 0 ? firstRow : undefined}
        rowHeight={QUEUE_ROW_HEIGHT}
          swipeToRemove={canEditQueue && !bulkJobRunning}
        accessibilityLabel={`${item.title}, ${trackSubtitle(item)}`}
        removeLabel="Remove"
        onRemove={() => removeTrack(item)}
        onTap={play}
        contentBackground={draggingIndex === index ? palette.surfaceRaised : undefined}
      >
        <TrackRow
          title={item.title || t('Unknown song')}
          subtitle={trackSubtitle(item)}
          artworkUri={item.artwork}
          artworkSize={QUEUE_ROW_ARTWORK}
          onPress={play}
          onLongPress={() => beginSelecting(item)}
          accessory={canEditQueue ? <DragHandle handle={handleProps(index)} /> : undefined}
        />
      </RemovableRow>
    );
  }, [bulkJobRunning, canEditQueue, draggingIndex, handleProps, onAction, palette.surfaceRaised, palette.accent, palette.inkMuted, removeTrack, selecting, selectedIds, toggleSelected, beginSelecting, t]);

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
    <BottomSheet visible={visible} onClose={close} fullHeight scrollable={false}>
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
          disabled={bulkJobRunning}
        />
        <IconButton
          icon={state.playbackMode === PlaybackMode.RepeatOne ? 'repeatOne' : 'repeat'}
          label={repeatLabel(state.playbackMode)}
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
            label="Clear"
            variant="plain"
            accessibilityLabel="Clear queue"
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
        label="Up next"
        tone="muted"
        caption={hasRows ? (canEditQueue ? t('Drag ≡ to reorder · swipe left to remove') : t('Swipe left to remove')) : undefined}
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
