import { useCallback, useEffect, useState } from 'react';
import type { RemoteTrack } from '../../data/types';
import type { QueueSheetProps } from './QueueSheet';

export function useQueueSelectionState(visible: boolean) {
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dismissedBulkStatus, setDismissedBulkStatus] = useState(false);
  const selecting = selectedIds.size > 0;
  useEffect(() => { if (!visible) setSelectedIds(new Set()); }, [visible]);
  return { confirmingClear, setConfirmingClear, selectedIds, setSelectedIds, selecting, dismissedBulkStatus, setDismissedBulkStatus };
}

type Selection = ReturnType<typeof useQueueSelectionState>;

export function useQueueRemovalProgress(state: QueueSheetProps['state'], dismissedBulkStatus: boolean, setDismissedBulkStatus: Selection['setDismissedBulkStatus']) {
  const { queueRemovalProgress, queueBusy } = state;
  const queueRemovalRunning = queueRemovalProgress?.phase === 'writing';
  const queueRemovalFinished = queueRemovalProgress && !queueRemovalRunning && !dismissedBulkStatus;
  useEffect(() => { if (queueRemovalRunning) setDismissedBulkStatus(false); }, [queueRemovalRunning]);
  return { queueRemovalProgress, queueBusy, queueRemovalRunning, queueRemovalFinished };
}

export function useQueueSelectionActions(
  { setConfirmingClear, selectedIds, setSelectedIds }: Selection,
  { queueBusy, queueRemovalRunning }: ReturnType<typeof useQueueRemovalProgress>,
  onAction: QueueSheetProps['onAction'],
  onClose: QueueSheetProps['onClose'],
) {
  const confirmClear = () => {
    setConfirmingClear(false);
    if (queueBusy) return;
    onAction({ type: 'ClearQueue' });
    onClose();
  };
  const close = () => {
    if (queueRemovalRunning) onAction({ type: 'CancelBulkAction' });
    onClose();
  };

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
    if (!selectedIds.size || queueBusy) return;
    onAction({ type: 'RemoveQueueTracks', ids: [...selectedIds] });
    setSelectedIds(new Set());
  };

  const cancelSelection = () => setSelectedIds(new Set());
  const handleBackPress = () => {
    if (selectedIds.size === 0) return false;
    cancelSelection();
    return true;
  };
  return { confirmClear, close, toggleSelected, beginSelecting, removeSelected, cancelSelection, handleBackPress };
}
