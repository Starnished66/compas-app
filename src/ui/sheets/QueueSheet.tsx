import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import type { ListRenderItem } from '@shopify/flash-list';
import { BulkActionProgress, ContentStatus, PlaybackMode, RemoteAction, RemoteTrack, RemoteUiState } from '../../data/types';
import { AppText } from '../components/AppText';
import { BottomSheet } from '../components/BottomSheet';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { IconButton } from '../components/IconButton';
import { InlineError } from '../components/InlineError';
import { QueueNowPlayingCard } from '../components/QueueNowPlayingCard';
import type { RemovableRowHandle } from '../components/RemovableRow';
import { SectionHeader } from '../components/SectionHeader';
import { useDisplayTrack } from '../useDisplayTrack';
import { usePalette } from '../PaletteProvider';
import { Durations } from '../motion';
import { useSnackbar } from '../snackbar/useSnackbar';
import { Space } from '../tokens';
import { useDragReorder } from '../useDragReorder';
import { useQueueReorder } from '../useQueueReorder';
import { useQueueArtworkViewability } from '../useQueueArtworkViewability';
import { useOptimisticErrorSnackbar } from './useOptimisticErrorSnackbar';
import { useQueueRemovalProgress, useQueueSelectionActions, useQueueSelectionState } from './useQueueSelection';
import {
  LoadEarlierQueueRow,
  PlayedQueueRow,
  QUEUE_ROW_HEIGHT,
  QueueListItem,
  QueueRow,
  renderQueueEmptyState,
  renderQueueTrackList,
} from './QueueTrackList';
import { useI18n } from '../../i18n';
import { localizedMessage } from '../localizedLabels';
import { isShuffleMode } from '../../session/playbackModes';

export interface QueuePlaybackState extends Pick<RemoteUiState,
  'currentTrack' | 'dacMode' | 'isPlaying' | 'supportedFeatures' | 'playbackMode' | 'connectionMessage' |
  'queue' | 'queuePlayed' | 'queuePlayedHasMore' | 'queuePlayedLoadingMore' | 'queueTotal' | 'queueStatus' | 'queueHasMore' | 'queueLoadingMore'> {
  queueRemovalProgress?: BulkActionProgress;
  queueBusy: boolean;
}

export interface QueueSheetProps {
  state: QueuePlaybackState;
  onAction: (action: RemoteAction) => void;
  visible: boolean;
  onClose: () => void;
}

const MODE_ICON_SIZE = 18;

let removeHintShown = false;

function repeatLabel(mode: PlaybackMode): string {
  if (mode === PlaybackMode.RepeatAll || mode === PlaybackMode.ShuffleRepeat) return 'Repeat';
  if (mode === PlaybackMode.RepeatOne) return 'Repeat once';
  return 'Repeat off';
}

export function QueueSheet({ state, onAction, visible, onClose }: QueueSheetProps) {
  const { t } = useI18n();
  const palette = usePalette();
  const snackbar = useSnackbar();
  const selection = useQueueSelectionState(visible);
  const { confirmingClear, setConfirmingClear, selectedIds, selecting, dismissedBulkStatus, setDismissedBulkStatus } = selection;
  const lastPageRequest = useRef('');
  const firstRow = useRef<RemovableRowHandle | null>(null);
  const nowPlaying = useDisplayTrack(state.currentTrack, state.dacMode, state.isPlaying);
  const canEditQueue = state.supportedFeatures.includes('queue_edit');
  const progress = useQueueRemovalProgress(state, dismissedBulkStatus, setDismissedBulkStatus);
  const { queueBusy } = progress;
  const { items, artwork, drag, cellStyle, hasRows } = useQueueList({
    state, onAction, visible, canEditQueue, selecting, firstRow, nowPlaying, snackbar, t,
  });
  const queueCount = Math.max(state.queueTotal, state.queue.length);
  const loadMore = useQueuePagination(state, onAction, lastPageRequest);
  const trackActions = useQueueTrackActions(state, onAction, snackbar, t, canEditQueue, queueBusy);
  const selectionActions = useQueueSelectionActions(selection, progress, onAction, onClose);
  const renderItem = useQueueItemRenderer({
    state, onAction, nowPlaying, selection, selectionActions, trackActions, drag, firstRow, canEditQueue, queueBusy, t,
  });
  const { removeSelected, cancelSelection, close, confirmClear, handleBackPress } = selectionActions;
  const hasPlayed = (state.queuePlayed?.length ?? 0) > 0;
  const listHeader = renderQueueStatus({
    state, onAction, progress, nowPlaying, hasRows, canEditQueue, hasPlayed, setDismissedBulkStatus, t,
  });

  return (
    <BottomSheet visible={visible} onClose={close} onBackPress={handleBackPress} fullHeight scrollable={false}>
      {renderQueueHeader({
        onAction, playbackMode: state.playbackMode, queueCount, queueBusy, canEditQueue,
        selectedCount: selectedIds.size, removeSelected, cancelSelection, openClear: () => setConfirmingClear(true), t,
      })}
      {renderQueueTrackList({ state, items, hasUpNext: hasRows, drag, cellStyle, artwork, renderItem, header: listHeader, loadMore, palette, t })}
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

interface QueueListOptions {
  state: QueuePlaybackState;
  onAction: QueueSheetProps['onAction'];
  visible: boolean;
  canEditQueue: boolean;
  selecting: boolean;
  firstRow: React.RefObject<RemovableRowHandle | null>;
  nowPlaying: ReturnType<typeof useDisplayTrack>;
  snackbar: ReturnType<typeof useSnackbar>;
  t: ReturnType<typeof useI18n>['t'];
}

function useQueueList({ state, onAction, visible, canEditQueue, selecting, firstRow, nowPlaying, snackbar, t }: QueueListOptions) {
  const { queueBusy } = state;
  const reorder = useQueueReorder(state.queue, onAction, ({ track, from, to }) =>
    snackbar.show({ text: t('Moved “{title}”', { title: track.title }), actionLabel: t('Undo'), onAction: () => reorder.move(to, from) }),
  );
  const rows = reorder.queue;
  const hasRows = rows.length > 0;
  const played = state.queuePlayed ?? [];

  const { items, upNextOffset, artworkTracks } = useMemo(() => {
    const built: QueueListItem[] = [];
    if (played.length > 0) {
      built.push({ kind: 'section', id: 'queue-section-played', label: t('Played') });
      if (state.queuePlayedHasMore || state.queuePlayedLoadingMore) {
        built.push({ kind: 'loadEarlier', id: 'queue-load-earlier' });
      }
      for (const track of played) {
        built.push({ kind: 'played', id: track.id, track });
      }
      if (nowPlaying) {
        built.push({ kind: 'nowPlaying', id: 'queue-now-playing' });
      }
      built.push({
        kind: 'section',
        id: 'queue-section-up-next',
        label: t('Up next'),
        caption: hasRows && canEditQueue ? t('Drag ≡ to reorder · swipe left to remove') : undefined,
      });
    }
    const offset = built.length;
    if (hasRows) {
      rows.forEach((track, upNextIndex) => {
        built.push({ kind: 'upNext', id: track.id, track, upNextIndex });
      });
    } else if (played.length > 0) {
      built.push({ kind: 'emptyUpNext', id: 'queue-empty-up-next' });
    }
    const tracks = built.map((item) => (item.kind === 'played' || item.kind === 'upNext' ? item.track : undefined));
    return { items: built, upNextOffset: offset, artworkTracks: tracks };
  }, [played, state.queuePlayedHasMore, state.queuePlayedLoadingMore, nowPlaying, hasRows, canEditQueue, rows, t]);

  const artwork = useQueueArtworkViewability(artworkTracks, onAction, visible);
  const drag = useDragReorder({
    itemCount: rows.length,
    rowHeight: QUEUE_ROW_HEIGHT,
    enabled: visible && canEditQueue && !reorder.moving && !selecting && !queueBusy,
    onMove: reorder.move,
  });
  const cellStyle = useCallback((index: number) => drag.rowStyle(index - upNextOffset), [drag.rowStyle, upNextOffset]);

  useEffect(() => {
    if (!visible || removeHintShown || !canEditQueue) return;
    const timer = setTimeout(() => {
      if (!firstRow.current) return;
      removeHintShown = true;
      firstRow.current.peek();
    }, Durations.peekDelay);
    return () => clearTimeout(timer);
  }, [visible, hasRows, canEditQueue]);
  return { items, artwork, drag, cellStyle, hasRows };
}

function useQueuePagination(state: QueuePlaybackState, onAction: QueueSheetProps['onAction'], lastPageRequest: React.RefObject<string>) {
  // A refresh restarts the list at its first page, so the same length:total key must be requestable again.
  useEffect(() => {
    if (state.queueStatus === ContentStatus.Loading) lastPageRequest.current = '';
  }, [state.queueStatus]);

  const loadMore = () => {
    const key = `${state.queue.length}:${state.queueTotal}`;
    if (!state.queueHasMore || state.queueLoadingMore || lastPageRequest.current === key) return;
    lastPageRequest.current = key;
    onAction({ type: 'LoadMoreQueue' });
  };

  return loadMore;
}

function useQueueTrackActions(
  state: QueuePlaybackState, onAction: QueueSheetProps['onAction'], snackbar: ReturnType<typeof useSnackbar>,
  t: ReturnType<typeof useI18n>['t'], canEditQueue: boolean, queueBusy: boolean,
) {
  const watchResult = useOptimisticErrorSnackbar(state.connectionMessage, state.queueStatus);
  const latest = useRef({ onAction, snackbar, t, canEditQueue, queueBusy, watchResult });
  latest.current = { onAction, snackbar, t, canEditQueue, queueBusy, watchResult };

  const removeTrack = useCallback((track: RemoteTrack) => {
    const current = latest.current;
    if (current.queueBusy) return;
    // Same as Home's Up next: confirm once the queue refresh after the removal settles.
    let refreshing = false;
    current.watchResult({
      message: { text: current.t('Removed “{title}”', { title: track.title }) },
      confirmed: (status) => {
        if (status === ContentStatus.Loading) refreshing = true;
        return refreshing && status !== ContentStatus.Loading;
      },
    });
    current.onAction({ type: 'RemoveQueueTrack', id: track.id });
  }, []);

  // Same feedback as Home's Up next when the player can't jump within its queue.
  const playTrack = useCallback((track: RemoteTrack) => {
    const current = latest.current;
    if (current.queueBusy) return;
    if (!current.canEditQueue) {
      current.snackbar.show({ text: current.t('This player can’t jump to a song in the queue.') });
      return;
    }
    current.onAction({ type: 'PlayQueueTrack', id: track.id });
  }, []);

  return { removeTrack, playTrack };
}

interface QueueItemRendererOptions {
  state: QueuePlaybackState;
  onAction: QueueSheetProps['onAction'];
  nowPlaying: ReturnType<typeof useDisplayTrack>;
  selection: ReturnType<typeof useQueueSelectionState>;
  selectionActions: ReturnType<typeof useQueueSelectionActions>;
  trackActions: ReturnType<typeof useQueueTrackActions>;
  drag: ReturnType<typeof useDragReorder>;
  firstRow: QueueListOptions['firstRow'];
  canEditQueue: boolean;
  queueBusy: boolean;
  t: ReturnType<typeof useI18n>['t'];
}

function useQueueItemRenderer({
  state, onAction, nowPlaying, selection, selectionActions, trackActions, drag, firstRow, canEditQueue, queueBusy, t,
}: QueueItemRendererOptions) {
  const { selecting, selectedIds } = selection;
  const { toggleSelected, beginSelecting } = selectionActions;
  const { playTrack, removeTrack } = trackActions;
  const { draggingIndex, handleProps } = drag;
  const renderItem: ListRenderItem<QueueListItem> = useCallback(({ item }) => {
    switch (item.kind) {
      case 'loadEarlier':
        return (
          <LoadEarlierQueueRow
            loading={Boolean(state.queuePlayedLoadingMore)}
            onLoad={() => onAction({ type: 'LoadMorePlayedQueue' })}
          />
        );
      case 'section':
        return <SectionHeader label={item.label} caption={item.caption} tone="muted" style={styles.sectionHeader} />;
      case 'played':
        return <PlayedQueueRow track={item.track} onPlay={playTrack} />;
      case 'nowPlaying':
        return nowPlaying ? (
          <QueueNowPlayingCard track={nowPlaying} isPlaying={state.isPlaying} style={styles.nowPlaying} />
        ) : null;
      case 'emptyUpNext':
        return renderQueueEmptyState(state, t);
      case 'upNext':
        return (
          <QueueRow
            track={item.track}
            selecting={selecting}
            selected={selecting && selectedIds.has(item.track.id)}
            lifted={draggingIndex === item.upNextIndex}
            removable={canEditQueue && !queueBusy}
            dragHandle={canEditQueue ? handleProps(item.upNextIndex) : undefined}
            rowRef={item.upNextIndex === 0 ? firstRow : undefined}
            onPlay={playTrack}
            onToggleSelected={toggleSelected}
            onBeginSelecting={beginSelecting}
            onRemove={removeTrack}
          />
        );
    }
  }, [
    state, onAction, nowPlaying, queueBusy, canEditQueue, draggingIndex, handleProps, playTrack,
    removeTrack, selecting, selectedIds, toggleSelected, beginSelecting, firstRow, t,
  ]);

  return renderItem;
}

interface QueueHeaderOptions {
  onAction: QueueSheetProps['onAction'];
  playbackMode: PlaybackMode;
  queueCount: number;
  queueBusy: boolean;
  canEditQueue: boolean;
  selectedCount: number;
  removeSelected: () => void;
  cancelSelection: () => void;
  openClear: () => void;
  t: ReturnType<typeof useI18n>['t'];
}

function renderQueueHeader({ onAction, playbackMode, queueCount, queueBusy, canEditQueue, selectedCount, removeSelected, cancelSelection, openClear, t }: QueueHeaderOptions) {
  const shuffleOn = isShuffleMode(playbackMode);
  const repeatOn = playbackMode === PlaybackMode.RepeatAll || playbackMode === PlaybackMode.RepeatOne || playbackMode === PlaybackMode.ShuffleRepeat;
  return (
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
        disabled={queueBusy}
      />
      <IconButton
        icon={playbackMode === PlaybackMode.RepeatOne ? 'repeatOne' : 'repeat'}
        label={t(repeatLabel(playbackMode))}
        size="sm"
        iconSize={MODE_ICON_SIZE}
        active={repeatOn}
        onPress={() => onAction({ type: 'CycleRepeatMode' })}
        disabled={queueBusy}
      />
      {selectedCount > 0 ? (
        <>
          <AppText variant="caption" tone="inkMuted">{t('{count} selected', { count: selectedCount })}</AppText>
          <Button label={t('Remove')} variant="destructive" disabled={!canEditQueue || queueBusy} onPress={removeSelected} />
          <Button label={t('Cancel')} variant="plain" onPress={cancelSelection} />
        </>
      ) : (
        <Button
          label={t('Clear')}
          variant="plain"
          accessibilityLabel={t('Clear queue')}
          disabled={queueCount === 0 || queueBusy}
          onPress={openClear}
        />
      )}
    </View>
  );
}

interface QueueStatusOptions {
  state: QueuePlaybackState;
  onAction: QueueSheetProps['onAction'];
  progress: ReturnType<typeof useQueueRemovalProgress>;
  nowPlaying: ReturnType<typeof useDisplayTrack>;
  hasRows: boolean;
  canEditQueue: boolean;
  hasPlayed: boolean;
  setDismissedBulkStatus: ReturnType<typeof useQueueSelectionState>['setDismissedBulkStatus'];
  t: ReturnType<typeof useI18n>['t'];
}

function formatProgressMessage(
  message: string | null | undefined,
  values: Record<string, string | number> | undefined,
  t: ReturnType<typeof useI18n>['t'],
): string | null {
  if (!message) return null;
  if (!values) return localizedMessage(message, t);
  const localizedValues = typeof values.error === 'string'
    ? { ...values, error: localizedMessage(values.error, t) }
    : values;
  return t(message, localizedValues);
}

function renderQueueStatus({
  state, onAction, progress, nowPlaying, hasRows, canEditQueue, hasPlayed, setDismissedBulkStatus, t,
}: QueueStatusOptions) {
  const { queueRemovalRunning, queueRemovalFinished, queueRemovalProgress } = progress;
  return (
    <View>
      {queueRemovalRunning ? <View style={styles.progress}><AppText>{t('{completed} of {total} processed', { completed: queueRemovalProgress?.completed ?? 0, total: queueRemovalProgress?.total ?? 0 })}</AppText><Button label={t('Stop')} variant="plain" onPress={() => onAction({ type: 'CancelBulkAction' })} /></View> : null}
      {queueRemovalFinished ? <View style={styles.progress}><AppText>{formatProgressMessage(queueRemovalProgress?.message, queueRemovalProgress?.messageValues, t)}</AppText><Button label={t('Done')} variant="plain" onPress={() => setDismissedBulkStatus(true)} /></View> : null}
      {!hasPlayed && nowPlaying ? (
        <QueueNowPlayingCard
          track={nowPlaying}
          isPlaying={state.isPlaying}
          style={styles.nowPlaying}
        />
      ) : null}
      {state.connectionMessage ? (
        <InlineError message={state.connectionMessage} style={styles.error} />
      ) : null}
      {!hasPlayed ? (
        <SectionHeader
          label={t('Up next')}
          tone="muted"
          caption={hasRows && canEditQueue ? t('Drag ≡ to reorder · swipe left to remove') : undefined}
          style={styles.sectionHeader}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  progress: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Space.lg, paddingVertical: Space.sm, gap: Space.sm },
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
    marginVertical: Space.sm,
  },
  error: {
    marginHorizontal: Space.lg,
    marginBottom: Space.sm,
  },
  sectionHeader: {
    paddingRight: Space.lg,
  },
});
