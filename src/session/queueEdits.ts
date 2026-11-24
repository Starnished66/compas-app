import type { useQueuePages } from './useQueuePages';
import type { SessionState } from './useSessionRefs';
import { QueueTarget } from './queueTargets';
import { RemoteApi } from '../data/RemoteApi';
import {
  queueRemovalAmbiguousAt,
  queueRemovalMatches,
  readQueueSnapshot,
  waitForQueueTransition,
} from './bulkActions';

interface QueueEditsDependencies extends Pick<ReturnType<typeof useQueuePages>, 'refreshQueue'> {
  shared: Pick<SessionState,
    'apiRef' | 'bulkActionBusyRef' | 'bulkActionCancelledRef' | 'bulkActionRunRef'
    | 'connectedPlayerKeyRef' | 'connectionAttemptRef' | 'featureSetRef' | 'queueRevisionRef'
    | 'queueTargetsRef' | 'setState' | 'stateRef'
  >;
  abandonBulkProgress: (action: "queue" | "random" | "favorite" | "playlist" | "createPlaylist" | "queueRemove") => void;
  reconcileQueueAfterWrite: (api: RemoteApi) => void;
}

const removeQueueTrack = async (deps: QueueEditsDependencies, id: string) => {
  const { shared: { apiRef, bulkActionBusyRef, queueTargetsRef, setState }, refreshQueue } = deps;
  if (bulkActionBusyRef.current) return;
  const target = queueTargetsRef.current.get(id);
  const api = apiRef.current;
  if (!target || !api) return;

  setState((prev) => ({
    ...prev,
    queue: prev.queue.filter((t) => t.id !== id),
  }));

  try {
    await api.removeFromQueue(target.offset, target.revision);
    if (api === apiRef.current) {
      refreshQueue(api);
    }
  } catch (failure: any) {
    if (api !== apiRef.current) return;
    if (failure?.statusCode === 409) {
      setState((prev) => ({
        ...prev,
        connectionMessage: 'The queue changed. It has been refreshed; try again.',
      }));
      refreshQueue(api);
    } else {
      setState((prev) => ({
        ...prev,
        connectionMessage: failure?.message || 'Could not remove track from queue',
      }));
      await refreshQueue(api);
    }
  }
};

const createRemovalProgress = (
  { shared: { apiRef, connectedPlayerKeyRef, setState }, abandonBulkProgress }: QueueEditsDependencies,
  api: RemoteApi, playerKey: string | null, selected: QueueTarget[],
) => {
  const counts = { processed: 0, succeeded: 0, failed: 0 };
  const total = new Set(selected.map((target) => target.offset)).size;
  const publish = (phase: 'writing' | 'cancelled' | 'error' | 'done', message?: string, messageValues?: Record<string, string | number>) => {
    if (api !== apiRef.current || playerKey !== connectedPlayerKeyRef.current) {
      if (phase !== 'writing') abandonBulkProgress('queueRemove');
      return;
    }
    setState((prev) => ({ ...prev, bulkActionProgress: { action: 'queueRemove', completed: counts.processed, total, ...counts, phase, message: message ?? null, messageValues } }));
  };
  const countValues = () => ({ ...counts, total });
  return { counts, publish, countValues };
};

function publishQueueRemovalCancelled(
  publish: ReturnType<typeof createRemovalProgress>['publish'],
  countValues: ReturnType<typeof createRemovalProgress>['countValues'],
  writePending: boolean,
) {
  const message = writePending
    ? 'Stopped. {succeeded} succeeded, {failed} failed, {processed} processed of {total}. One removal may still be completing; the queue is being refreshed.'
    : 'Stopped. {succeeded} succeeded, {failed} failed, {processed} processed of {total}. Confirmed removals remain applied.';
  publish('cancelled', message, countValues());
}

function publishQueueRemovalError(
  publish: ReturnType<typeof createRemovalProgress>['publish'],
  countValues: ReturnType<typeof createRemovalProgress>['countValues'],
  removalInFlight: boolean,
  error: string,
) {
  const message = removalInFlight
    ? '{succeeded} succeeded, {failed} failed, {processed} processed of {total}. {error} One removal may still finish; refresh the queue before retrying.'
    : '{succeeded} succeeded, {failed} failed, {processed} processed of {total}. {error} Confirmed removals remain applied.';
  publish('error', message, { ...countValues(), error });
}

const removeSelectedTracks = async (
  {
    shared: {
      apiRef, connectedPlayerKeyRef, bulkActionRunRef, bulkActionBusyRef, bulkActionCancelledRef,
    },
    refreshQueue,
  }: QueueEditsDependencies,
  api: RemoteApi, playerKey: string | null, selected: QueueTarget[], run: number, isCancelled: () => boolean,
  { counts, publish, countValues }: ReturnType<typeof createRemovalProgress>,
) => {
  let removalInFlight = false;
  let writeAttempted = false;
  try {
    publish('writing');
    let snapshot = await readQueueSnapshot((offset, limit) => api.queue(offset, limit), isCancelled);
    if (isCancelled()) { publishQueueRemovalCancelled(publish, countValues, false); return; }
    if (selected.some((target) => target.revision !== snapshot.revision || snapshot.songs[target.offset]?.index !== target.songIndex)) {
      throw new Error('Queue changed. Select tracks again before removing them.');
    }
    const offsets = [...new Set(selected.map((target) => target.offset))].sort((a, b) => b - a);
    for (const offset of offsets) {
      if (isCancelled()) break;
      const before = snapshot;
      if (queueRemovalAmbiguousAt(before.songs, offset)) throw new Error('The same song appears more than once beside this selection. Select a different occurrence or remove one at a time.');
      removalInFlight = true;
      writeAttempted = true;
      await api.removeFromQueue(offset, before.revision);
      // The command ACK may precede the GUI mutation. Poll without adopting an unverified revision.
      let confirmed: Awaited<ReturnType<typeof readQueueSnapshot>> | null;
      try {
        confirmed = await waitForQueueTransition(before, before.revision + 1,
          (observed) => queueRemovalMatches(before.songs, observed.songs, offset),
          () => readQueueSnapshot((pageOffset, limit) => api.queue(pageOffset, limit), isCancelled), isCancelled);
      } catch {
        if (isCancelled()) { confirmed = null; }
        else throw new Error('Queue changed during removal. Remaining selections were stopped.');
      }
      if (isCancelled()) break;
      if (!confirmed) throw new Error('Removal was accepted but could not be confirmed. Remaining selections were stopped.');
      snapshot = confirmed;
      removalInFlight = false;
      counts.succeeded++;
      counts.processed++;
      writeAttempted = false;
      publish('writing');
    }
    if (isCancelled()) publishQueueRemovalCancelled(publish, countValues, removalInFlight);
    else publish('done', '{succeeded} succeeded, {failed} failed, {processed} processed of {total}.', countValues());
  } catch (err: any) {
    if (isCancelled()) {
      publishQueueRemovalCancelled(publish, countValues, writeAttempted);
    } else {
      if (writeAttempted) { counts.failed++; counts.processed++; }
      publishQueueRemovalError(publish, countValues, removalInFlight, err?.message || 'Queue removal stopped.');
    }
  } finally {
    if (api === apiRef.current && playerKey === connectedPlayerKeyRef.current) await refreshQueue(api);
    if (run === bulkActionRunRef.current) { bulkActionBusyRef.current = false; bulkActionCancelledRef.current = false; }
  }
};

const removeQueueTracks = async (deps: QueueEditsDependencies, ids: string[]) => {
  const { refreshQueue } = deps;
  const {
    apiRef, bulkActionBusyRef, bulkActionCancelledRef, bulkActionRunRef, connectedPlayerKeyRef,
    connectionAttemptRef, featureSetRef, queueTargetsRef, setState,
  } = deps.shared;
  const api = apiRef.current;
  if (!api || bulkActionBusyRef.current || !featureSetRef.current.has('queue_edit')) return;
  const playerKey = connectedPlayerKeyRef.current;
  const selected = ids.map((id) => queueTargetsRef.current.get(id)).filter((item): item is QueueTarget => Boolean(item));
  if (!selected.length || selected.length !== ids.length) {
    if (api) {
      setState((prev) => ({ ...prev, bulkActionProgress: { action: 'queueRemove', completed: 0, total: ids.length, succeeded: 0, failed: 0, processed: 0, phase: 'error', message: 'Queue changed. Select tracks again before removing them.' } }));
      await refreshQueue(api);
    }
    return;
  }
  bulkActionBusyRef.current = true;
  bulkActionCancelledRef.current = false;
  const run = ++bulkActionRunRef.current;
  const attempt = connectionAttemptRef.current;
  const isCancelled = () => bulkActionCancelledRef.current || run !== bulkActionRunRef.current || api !== apiRef.current || playerKey !== connectedPlayerKeyRef.current || attempt !== connectionAttemptRef.current;
  const progress = createRemovalProgress(deps, api, playerKey, selected);
  await removeSelectedTracks(deps, api, playerKey, selected, run, isCancelled, progress);
};

const clearQueue = async (deps: QueueEditsDependencies) => {
  const { reconcileQueueAfterWrite, refreshQueue } = deps;
  const { apiRef, bulkActionBusyRef, queueRevisionRef, setState, stateRef } = deps.shared;
  if (bulkActionBusyRef.current) return;
  const api = apiRef.current;
  if (!api || stateRef.current.queueTotal === 0) return;
  try {
    await api.clearQueue(queueRevisionRef.current);
    reconcileQueueAfterWrite(api);
  } catch (err: any) {
    if (api !== apiRef.current) return;
    if (err?.statusCode === 409) {
      setState((prev) => ({ ...prev, connectionMessage: 'The queue changed. Review it and try again.' }));
      await refreshQueue(api);
    } else {
      setState((prev) => ({ ...prev, connectionMessage: err?.message || 'Could not clear the queue' }));
    }
  }
};

const editQueue = async (deps: QueueEditsDependencies, id: string, direction?: -1 | 1) => {
  const { reconcileQueueAfterWrite, refreshQueue } = deps;
  const { apiRef, bulkActionBusyRef, featureSetRef, queueTargetsRef, setState, stateRef } = deps.shared;
  if (bulkActionBusyRef.current) return;
  const api = apiRef.current;
  const target = queueTargetsRef.current.get(id);
  if (!api || !target || !featureSetRef.current.has('queue_edit')) return;
  if (direction && target.full) return;
  if (direction && (target.offset + direction < 0 || target.offset + direction >= stateRef.current.queueTotal)) return;
  try {
    if (direction) await api.moveQueueTrack(target.offset, target.offset + direction, target.revision);
    else await api.playQueueTrack(target.offset, target.revision, Boolean(target.full));
    reconcileQueueAfterWrite(api);
  } catch (err: any) {
    if (api !== apiRef.current) return;
    setState((prev) => ({ ...prev, connectionMessage: err?.statusCode === 409
      ? 'The queue changed. Review it and try again.' : err?.message || 'Could not edit queue' }));
    refreshQueue(api);
  }
};

export function createQueueEdits(deps: QueueEditsDependencies) {
  return {
    removeQueueTrack: removeQueueTrack.bind(undefined, deps),
    removeQueueTracks: removeQueueTracks.bind(undefined, deps),
    clearQueue: clearQueue.bind(undefined, deps),
    editQueue: editQueue.bind(undefined, deps),
  };
}
