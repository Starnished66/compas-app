import { useQueuePages } from './useQueuePages';
import { createQueueEdits } from './queueEdits';
import { createQueueSessionArtwork } from './queueSessionArtwork';
import { createQueueActions } from './queueActions';
import { useLazyRef } from './useLazyRef';
import type { BulkActionProgress } from '../data/types';
import type { useSessionArtwork } from './useSessionArtwork';
import type { SessionState } from './useSessionRefs';

interface RemoteQueueDependencies extends Pick<ReturnType<typeof useSessionArtwork>, 'artworkSources'> {
  abandonBulkProgress: (action: BulkActionProgress['action']) => void;
  shared: SessionState;
}

export function useRemoteQueue({ shared, artworkSources, abandonBulkProgress }: RemoteQueueDependencies) {
  const { loadQueueArtwork } = createQueueSessionArtwork({ shared, artworkSources });
  const pages = useQueuePages({ shared, loadQueueArtwork });
  const actions = useLazyRef(() => {
    const edits = createQueueEdits({
      shared, abandonBulkProgress, refreshQueue: pages.refreshQueue,
      reconcileQueueAfterWrite: pages.reconcileQueueAfterWrite,
    });
    return createQueueActions({ shared, loadQueueArtwork, loadMoreQueue: pages.loadMoreQueue, ...edits });
  }).current;

  return {
    refreshQueue: pages.refreshQueue,
    reconcileQueueAfterWrite: pages.reconcileQueueAfterWrite,
    refreshQueueIfChanged: pages.refreshQueueIfChanged,
    ...actions,
  };
}
