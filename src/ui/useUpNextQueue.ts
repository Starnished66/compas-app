import { useCallback, useRef } from 'react';
import { ContentStatus, RemoteAction, RemoteTrack, RemoteUiState } from '../data/types';
import { recordSkip } from './skipDirection';
import { useSnackbar } from './snackbar/useSnackbar';
import { trackKey } from './trackKey';
import { DragReorder, useDragReorder } from './useDragReorder';
import { useQueueReorder } from './useQueueReorder';
import { useOptimisticErrorSnackbar } from './sheets/useOptimisticErrorSnackbar';
import { useI18n } from '../i18n';

export interface UpNextQueue {
  rows: RemoteTrack[];
  drag: DragReorder;
  canEditQueue: boolean;
  playTrack(track: RemoteTrack): void;
  removeTrack(track: RemoteTrack): void;
}

export function useUpNextQueue(
  state: RemoteUiState,
  onAction: (action: RemoteAction) => void,
  editing: boolean,
  rowHeight: number,
  onReorderActiveChange?: (active: boolean) => void,
): UpNextQueue {
  const { t } = useI18n();
  const snackbar = useSnackbar();
  const canEditQueue = state.supportedFeatures.includes('queue_edit');
  const reorder = useQueueReorder(state.queue, onAction, ({ track, from, to }) =>
    snackbar.show({ text: t('Moved “{title}”', { title: track.title }), actionLabel: t('Undo'), onAction: () => reorder.move(to, from) }),
  );
  const drag = useDragReorder({
    itemCount: reorder.queue.length,
    rowHeight,
    enabled: editing && canEditQueue && !reorder.moving,
    onMove: reorder.move,
    onDragStateChange: onReorderActiveChange,
  });
  const watchResult = useOptimisticErrorSnackbar(state.connectionMessage, state.queueStatus);
  const latest = useRef({ state, onAction, snackbar, canEditQueue, t, watchResult });
  latest.current = { state, onAction, snackbar, canEditQueue, t, watchResult };

  const playTrack = useCallback((track: RemoteTrack) => {
    const current = latest.current;
    if (!current.canEditQueue) {
      current.snackbar.show({ text: current.t('This player can’t jump to a song in the queue.') });
      return;
    }
    recordSkip(1, trackKey(current.state.currentTrack));
    current.onAction({ type: 'PlayQueueTrack', id: track.id });
  }, []);

  const removeTrack = useCallback((track: RemoteTrack) => {
    // The row disappears optimistically; the snackbar waits for the queue refresh that follows a
    // successful removal (Loading, then settled) so a failure is the only message shown.
    let refreshing = false;
    latest.current.watchResult({
      message: { text: latest.current.t('Removed “{title}”', { title: track.title }) },
      confirmed: (status) => {
        if (status === ContentStatus.Loading) refreshing = true;
        return refreshing && status !== ContentStatus.Loading;
      },
    });
    latest.current.onAction({ type: 'RemoveQueueTrack', id: track.id });
  }, []);

  return { rows: reorder.queue, drag, canEditQueue, playTrack, removeTrack };
}
