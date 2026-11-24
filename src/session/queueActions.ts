import type { SessionState } from './useSessionRefs';
import { type ActionOf } from './remoteActionDispatch';
import { RemoteApi } from '../data/RemoteApi';

interface QueueActionsDependencies {
  shared: Pick<SessionState, 'apiRef' | 'queueTargetsRef'>;
  clearQueue: () => Promise<void>;
  editQueue: (id: string, direction?: 1 | -1 | undefined) => Promise<void>;
  loadMoreQueue: () => Promise<void>;
  loadMorePlayedQueue: () => Promise<void>;
  loadQueueArtwork: (songIndexes: number[], api: RemoteApi, retry?: boolean) => void;
  removeQueueTrack: (id: string) => Promise<void>;
  removeQueueTracks: (ids: string[]) => Promise<void>;
}

const handleLoadMoreQueue = (deps: QueueActionsDependencies) => {
  const { loadMoreQueue } = deps;
  loadMoreQueue();
};

const handleLoadMorePlayedQueue = (deps: QueueActionsDependencies) => {
  const { loadMorePlayedQueue } = deps;
  loadMorePlayedQueue();
};

const handleRetryQueueArtwork = (deps: QueueActionsDependencies, action: ActionOf<'RetryQueueArtwork'>) => {
  const { shared: { apiRef, queueTargetsRef }, loadQueueArtwork } = deps;
  if (apiRef.current) loadQueueArtwork(action.ids.map((id) => queueTargetsRef.current.get(id)?.songIndex ?? -1), apiRef.current, true);
};

const handleRemoveQueueTrack = (deps: QueueActionsDependencies, action: ActionOf<'RemoveQueueTrack'>) => {
  const { removeQueueTrack } = deps;
  removeQueueTrack(action.id);
};

const handleRemoveQueueTracks = (deps: QueueActionsDependencies, action: ActionOf<'RemoveQueueTracks'>) => {
  const { removeQueueTracks } = deps;
  removeQueueTracks(action.ids);
};

const handleClearQueue = (deps: QueueActionsDependencies) => {
  const { clearQueue } = deps;
  clearQueue();
};

const handleMoveQueueTrack = (deps: QueueActionsDependencies, action: ActionOf<'MoveQueueTrack'>) => {
  const { editQueue } = deps;
  editQueue(action.id, action.direction);
};

const handlePlayQueueTrack = (deps: QueueActionsDependencies, action: ActionOf<'PlayQueueTrack'>) => {
  const { editQueue } = deps;
  editQueue(action.id);
};

export function createQueueActions(deps: QueueActionsDependencies) {
  return {
    queueActions: {
      LoadMoreQueue: handleLoadMoreQueue.bind(undefined, deps),
      LoadMorePlayedQueue: handleLoadMorePlayedQueue.bind(undefined, deps),
      RetryQueueArtwork: handleRetryQueueArtwork.bind(undefined, deps),
      RemoveQueueTrack: handleRemoveQueueTrack.bind(undefined, deps),
      RemoveQueueTracks: handleRemoveQueueTracks.bind(undefined, deps),
      ClearQueue: handleClearQueue.bind(undefined, deps),
      MoveQueueTrack: handleMoveQueueTrack.bind(undefined, deps),
      PlayQueueTrack: handlePlayQueueTrack.bind(undefined, deps),
    },
  };
}
