import type { SessionState } from './useSessionRefs';
import { QUEUE_REFRESHING_MESSAGE } from './queueTargets';
import { useRef } from 'react';
import { ContentStatus, RemoteTrack, Song } from '../data/types';
import { RemoteApi } from '../data/RemoteApi';

interface RemoteQueueDependencies {
  shared: Pick<SessionState,
    'apiRef' | 'lastQueueRefreshAtRef' | 'nextEntryId' | 'queueArtworkBySongRef'
    | 'queuePageGenerationRef' | 'queueRefreshGenerationRef' | 'queueRefreshRef' | 'queueRevisionRef'
    | 'queueTargetsRef' | 'setState' | 'stateRef'
  >;
  loadQueueArtwork: (songIndexes: number[], api: RemoteApi, retry?: boolean) => void;
}

interface QueuePagesContext extends RemoteQueueDependencies {
  queueProbeRef: React.RefObject<RemoteApi | null>;
}

// Queue Operations
const queueTrackFrom = (deps: QueuePagesContext, song: Song, fallbackOffset: number, revision: number): RemoteTrack => {
  const { nextEntryId, queueArtworkBySongRef, queueTargetsRef } = deps.shared;
  const id = nextEntryId('queue');
  const offset = song.offset != null ? song.offset : fallbackOffset;
  queueTargetsRef.current.set(id, { offset, revision, songIndex: song.index });
  return {
    id,
    title: song.title,
    artist: song.artist,
    album: song.album,
    duration: '',
    artwork: queueArtworkBySongRef.current.get(song.index) ?? null,
    queueOffset: offset,
  };
};

const refreshQueue = async (deps: QueuePagesContext, activeApi?: RemoteApi, ownsRequest: () => boolean = () => true, notBefore = 0): Promise<void> => {
  const { apiRef, queuePageGenerationRef, queueRefreshGenerationRef, queueRefreshRef, setState } = deps.shared;
  const api = activeApi || apiRef.current;
  if (!api || api !== apiRef.current || !ownsRequest()) return;
  const pending = queueRefreshRef.current?.api === api ? queueRefreshRef.current : null;
  if (pending?.owns() && (!pending.started ||
      (pending.started.at >= notBefore && pending.started.command === api.commandGeneration))) return pending.done;

  // Revoke the previous read's ownership before waiting for it to drain.
  const generation = ++queueRefreshGenerationRef.current;
  const ownsRefresh = () => ownsRequest() && api === apiRef.current && generation === queueRefreshGenerationRef.current;
  queuePageGenerationRef.current++;
  setState((prev) => ({ ...prev, queueStatus: ContentStatus.Loading, queueLoadingMore: false }));
  const request = { api, owns: ownsRefresh, started: null as { at: number; command: number } | null };
  const read = async () => {
    if (!ownsRefresh()) return;
    request.started = { at: Date.now(), command: api.commandGeneration };
    await readQueuePage(deps, api, ownsRefresh);
  };
  const done = (pending && notBefore ? pending.done.then(read) : read()).finally(() => {
    if (queueRefreshRef.current?.done === done) queueRefreshRef.current = null;
  });
  queueRefreshRef.current = Object.assign(request, { done });
  return done;
};

const reconcileQueueAfterWrite = (deps: QueuePagesContext, api: RemoteApi) => {
  const delay = 350;
  const deadline = Date.now() + delay;
  setTimeout(() => void refreshQueue(deps, api, undefined, deadline), delay);
};

const readQueuePage = async (deps: QueuePagesContext, api: RemoteApi, ownsRefresh: () => boolean) => {
  const { shared: { queueRevisionRef, queueTargetsRef, setState }, loadQueueArtwork } = deps;
  try {
    const qPage = await api.queue(0, 25);
    if (!ownsRefresh()) return;
    queueRevisionRef.current = qPage.revision;
    queueTargetsRef.current.clear();

    const tracks = qPage.songs.map((song, idx) => queueTrackFrom(deps, song, idx, qPage.revision));

    setState((prev) => ({
      ...prev,
      queue: tracks,
      queueTotal: qPage.total,
      queueHasMore: tracks.length < qPage.total,
      queueStatus: tracks.length > 0 ? ContentStatus.Ready : ContentStatus.Empty,
      // The refresh this message announced is done.
      connectionMessage: prev.connectionMessage === QUEUE_REFRESHING_MESSAGE ? null : prev.connectionMessage,
    }));
    loadQueueArtwork(qPage.songs.map((song) => song.index), api);
  } catch {
    if (!ownsRefresh()) return;
    setState((prev) => ({ ...prev, queueStatus: ContentStatus.Error }));
  }
};

const refreshQueueIfChanged = async (deps: QueuePagesContext, api: RemoteApi, ownsPoll: () => boolean) => {
  const { queueProbeRef } = deps;
  const { lastQueueRefreshAtRef, queueRefreshGenerationRef, queueRefreshRef, queueRevisionRef, stateRef } = deps.shared;
  if (queueProbeRef.current === api || queueRefreshRef.current?.api === api) return;
  queueProbeRef.current = api;
  const generation = queueRefreshGenerationRef.current;
  try {
    const page = await api.queue(0, 1);
    if (!ownsPoll() || generation !== queueRefreshGenerationRef.current) return;
    lastQueueRefreshAtRef.current = Date.now();
    if (page.revision !== queueRevisionRef.current || page.total !== stateRef.current.queueTotal) {
      await refreshQueue(deps, api, ownsPoll);
    }
  } finally {
    if (queueProbeRef.current === api) queueProbeRef.current = null;
  }
};

const loadMoreQueue = async (deps: QueuePagesContext) => {
  const { loadQueueArtwork } = deps;
  const {
    apiRef, queuePageGenerationRef, queueRefreshGenerationRef, queueRefreshRef, queueRevisionRef,
    setState, stateRef,
  } = deps.shared;
  const api = apiRef.current;
  if (!api || queueRefreshRef.current?.api === api || stateRef.current.queueLoadingMore || !stateRef.current.queueHasMore) return;
  const refreshGeneration = queueRefreshGenerationRef.current;
  const pageGeneration = ++queuePageGenerationRef.current;

  setState((prev) => ({ ...prev, queueLoadingMore: true }));
  try {
    const currentLen = stateRef.current.queue.length;
    const qPage = await api.queue(currentLen, 25);
    if (api !== apiRef.current
      || refreshGeneration !== queueRefreshGenerationRef.current
      || pageGeneration !== queuePageGenerationRef.current) return;

    if (qPage.revision !== queueRevisionRef.current) {
      setState((prev) => ({
        ...prev,
        queueLoadingMore: false,
        connectionMessage: QUEUE_REFRESHING_MESSAGE,
      }));
      refreshQueue(deps, api);
      return;
    }

    const newTracks = qPage.songs.map((song, idx) => queueTrackFrom(deps, song, currentLen + idx, qPage.revision));

    setState((prev) => ({
      ...prev,
      queue: [...prev.queue, ...newTracks],
      queueHasMore: prev.queue.length + newTracks.length < qPage.total,
      queueLoadingMore: false,
    }));
    loadQueueArtwork(qPage.songs.map((song) => song.index), api);
  } catch {
    if (api !== apiRef.current
      || refreshGeneration !== queueRefreshGenerationRef.current
      || pageGeneration !== queuePageGenerationRef.current) return;
    setState((prev) => ({ ...prev, queueLoadingMore: false }));
  }
};

function createQueuePages(deps: QueuePagesContext) {
  return {
    refreshQueue: refreshQueue.bind(undefined, deps),
    reconcileQueueAfterWrite: reconcileQueueAfterWrite.bind(undefined, deps),
    refreshQueueIfChanged: refreshQueueIfChanged.bind(undefined, deps),
    loadMoreQueue: loadMoreQueue.bind(undefined, deps),
  };
}

export function useQueuePages(deps: RemoteQueueDependencies) {
  const queueProbeRef = useRef<RemoteApi | null>(null);
  return createQueuePages({ ...deps, queueProbeRef });
}
