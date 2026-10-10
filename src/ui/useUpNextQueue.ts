import { useCallback, useRef } from 'react';
import { RemoteAction, RemoteTrack, RemoteUiState } from '../data/types';
import { recordSkip } from './skipDirection';
import { useSnackbar } from './snackbar/useSnackbar';
import { trackKey } from './trackKey';
import { DragReorder, useDragReorder } from './useDragReorder';
import { useQueueReorder } from './useQueueReorder';

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
  const snackbar = useSnackbar();
  const canEditQueue = state.supportedFeatures.includes('queue_edit');
  const reorder = useQueueReorder(state.queue, onAction, ({ track, from, to }) =>
    snackbar.show({ text: `Moved “${track.title}”`, actionLabel: 'Undo', onAction: () => reorder.move(to, from) }),
  );
  const drag = useDragReorder({
    itemCount: reorder.queue.length,
    rowHeight,
    enabled: editing && canEditQueue && !reorder.moving,
    onMove: reorder.move,
    onDragStateChange: onReorderActiveChange,
  });
  const latest = useRef({ state, onAction, snackbar, canEditQueue });
  latest.current = { state, onAction, snackbar, canEditQueue };

  const playTrack = useCallback((track: RemoteTrack) => {
    const current = latest.current;
    if (!current.canEditQueue) {
      current.snackbar.show({ text: 'This player can’t jump to a song in the queue.' });
      return;
    }
    recordSkip(1, trackKey(current.state.currentTrack));
    current.onAction({ type: 'PlayQueueTrack', id: track.id });
  }, []);

  const removeTrack = useCallback((track: RemoteTrack) => {
    latest.current.onAction({ type: 'RemoveQueueTrack', id: track.id });
    latest.current.snackbar.show({ text: `Removed “${track.title}”` });
  }, []);

  return { rows: reorder.queue, drag, canEditQueue, playTrack, removeTrack };
}
