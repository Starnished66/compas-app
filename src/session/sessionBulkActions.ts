import type { useQueuePages } from './useQueuePages';
import type { createLibraryLists } from './libraryLists';
import type { SessionState } from './useSessionRefs';
import { RemoteAction, ContentStatus, LibraryCategory, Playlist, BulkActionProgress } from '../data/types';
import { RemoteApi } from '../data/RemoteApi';
import {
  BulkWriteCounts,
  queueInsertWindowMatches,
  queueInsertionOffsets,
  readQueueSnapshot,
  resolveBulkSongs,
  runPlaylistCreationJob,
  runSerialBulkWrites,
  waitForQueueTransition,
} from './bulkActions';
import { playlistNameIssue } from '../ui/playlistName';
import type { ExtensionPage } from './LibraryListCache';

interface SessionBulkActionsDependencies extends
  Pick<ReturnType<typeof createLibraryLists>, 'loadLibraryCategory'>,
  Pick<ReturnType<typeof useQueuePages>, 'refreshQueue'> {
  shared: Pick<SessionState,
    'activeCatalogRef' | 'apiRef' | 'bulkActionBusyRef' | 'bulkActionCancelledRef' | 'bulkActionRunRef'
    | 'bulkSelectionsRef' | 'currentLibraryCategoryRef' | 'featureSetRef' | 'libraryLoadGenerationRef'
    | 'setState' | 'stateRef'
  >;
  ownsCurrentPlayer: () => () => boolean;
  revalidateRatingAlbums: (api: RemoteApi, reopening?: boolean, restored?: ExtensionPage | null | undefined) => Promise<void>;
}

interface BulkQueueWrite {
  snapshot: Awaited<ReturnType<typeof readQueueSnapshot>> | null;
  cursor: number | null;
  needsRefresh: boolean;
  mayComplete: boolean;
}

async function confirmBulkQueueAppend(
  api: RemoteApi, songIndex: number, catalogRevision: string | null, isCancelled: () => boolean, queue: BulkQueueWrite,
) {
  if (!queue.snapshot) {
    queue.snapshot = await readQueueSnapshot((offset, limit) => api.queue(offset, limit), isCancelled);
    if (isCancelled()) throw new Error('Queue add was not confirmed before the action stopped.');
  }
  const before = queue.snapshot;
  // Reject stale queue state before issuing a command with no revision argument.
  const current = await api.queue(0, 25);
  if (isCancelled()) throw new Error('Queue add was not confirmed before the action stopped.');
  if (current.revision !== before.revision || current.total !== before.total) throw new Error('Queue changed. Remaining songs were stopped.');
  if (isCancelled()) throw new Error('Queue add was not confirmed before the action stopped.');
  queue.needsRefresh = true;
  queue.mayComplete = true;
  await api.addToQueue(songIndex, catalogRevision);
  if (isCancelled()) throw new Error('Queue add was not confirmed before the action stopped.');
  if (queue.cursor != null) {
    const cursor = queue.cursor;
    const pageOffset = Math.max(0, cursor - 1);
    const limit = Math.min(3, before.total + 1 - pageOffset);
    const confirmedPage = await waitForQueueTransition(before, before.revision + 1,
      (observed) => observed.total === before.total + 1 && observed.offset === pageOffset &&
        queueInsertWindowMatches(before.songs, cursor, songIndex, observed.songs, pageOffset),
      async () => {
        const page = await api.queue(pageOffset, limit);
        return { revision: page.revision, total: page.total, songs: page.songs, offset: page.offset };
      }, isCancelled);
    if (isCancelled()) throw new Error('Queue add was not confirmed before the action stopped.');
    if (!confirmedPage) throw new Error('Queue add was accepted but could not be confirmed. Remaining songs were stopped.');
    const updated = [...before.songs];
    updated.splice(cursor, 0, { index: songIndex, title: '', artist: '', album: '' });
    queue.snapshot = { revision: confirmedPage.revision, total: confirmedPage.total, songs: updated };
    queue.cursor = cursor + 1;
  } else {
    let confirmed: Awaited<ReturnType<typeof readQueueSnapshot>> | null;
    try {
      confirmed = await waitForQueueTransition(before, before.revision + 1,
        (observed) => observed.total === before.total + 1 && queueInsertionOffsets(before.songs, observed.songs, songIndex).length > 0,
        () => readQueueSnapshot((offset, limit) => api.queue(offset, limit), isCancelled), isCancelled);
    } catch { throw new Error('Queue changed during add. Remaining songs were stopped.'); }
    if (isCancelled()) throw new Error('Queue add was not confirmed before the action stopped.');
    if (!confirmed) throw new Error('Queue add was accepted but could not be confirmed. Remaining songs were stopped.');
    const candidates = queueInsertionOffsets(before.songs, confirmed.songs, songIndex);
    queue.snapshot = confirmed;
    queue.cursor = candidates.length === 1 ? candidates[0] + 1 : null;
  }
  queue.mayComplete = false;
}

type BulkActionRequest = Extract<RemoteAction, { type: 'RunBulkAction' }>;

const loadBulkPlaylists = async (deps: SessionBulkActionsDependencies) => {
  const { apiRef, featureSetRef, setState } = deps.shared;
  const api = apiRef.current;
  if (!api || !featureSetRef.current.has('playlist_edit')) return;
  setState((prev) => ({ ...prev, bulkPlaylistOptionsStatus: ContentStatus.Loading, bulkPlaylistOptions: [] }));
  try {
    const playlists = await api.playlists();
    if (api !== apiRef.current) return;
    setState((prev) => ({ ...prev, bulkPlaylistOptions: playlists, bulkPlaylistOptionsStatus: ContentStatus.Ready }));
  } catch (err: any) {
    if (api !== apiRef.current) return;
    setState((prev) => ({ ...prev, bulkPlaylistOptionsStatus: ContentStatus.Error, connectionMessage: err?.message || 'Could not load playlists' }));
  }
};

const cancelBulkAction = (deps: SessionBulkActionsDependencies) => {
  const { bulkActionCancelledRef } = deps.shared;
  // Cancellation is cooperative: retain busy ownership until the in-flight request settles.
  bulkActionCancelledRef.current = true;
};

// A bulk job that lost its player still has to leave a terminal phase, or its sheet keeps Stop forever.
const abandonBulkProgress = (deps: SessionBulkActionsDependencies, action: BulkActionProgress['action']) =>
  {
  const { setState } = deps.shared;
  return setState((prev) => {
    const progress = prev.bulkActionProgress;
    if (!progress || progress.action !== action || (progress.phase !== 'resolving' && progress.phase !== 'writing')) return prev;
    return {
      ...prev,
      bulkActionProgress: { ...progress, phase: 'cancelled', message: 'The connection changed. Completed changes remain applied.', messageValues: undefined },
    };
  });
};

const getBulkActionTarget = (deps: SessionBulkActionsDependencies, action: BulkActionRequest) => {
  const { apiRef, bulkActionBusyRef, bulkSelectionsRef, featureSetRef, setState, stateRef } = deps.shared;
  const api = apiRef.current;
  const reject = (message: string) => setState((prev) => ({ ...prev, bulkActionProgress: { action: action.action, completed: 0, total: 0, succeeded: 0, failed: 0, processed: 0, phase: 'error', message } }));
  if (!api || action.ids.length === 0) { reject('Select one or more items first.'); return; }
  if (bulkActionBusyRef.current) return;
  const feature = action.action === 'favorite' ? 'favorites_edit' : action.action === 'queue' || action.action === 'random' ? null : 'playlist_edit';
  if (feature && !featureSetRef.current.has(feature)) { reject('This player does not support that action.'); return; }
  if ((action.action === 'queue' || action.action === 'random') && !stateRef.current.currentTrack) {
    reject('Start a song before adding selected songs to the queue.');
    return;
  }
  const selection = bulkSelectionsRef.current.get(action.ids);
  if (!selection?.ownsSource()) { reject('The selection is no longer available. Select items again.'); return; }
  const name = action.action === 'createPlaylist' ? action.name?.trim() ?? '' : '';
  if (action.action === 'playlist' && !stateRef.current.bulkPlaylistOptions?.some((playlist) => playlist.key === action.key && playlist.writable)) { reject('Choose a writable playlist.'); return; }
  return { api, selection, name };
};

const createBulkProgress = (deps: SessionBulkActionsDependencies, action: BulkActionRequest, ownsPlayer: () => boolean) => {
  const { setState } = deps.shared;
  const counts = { completed: 0, total: 0, succeeded: 0, failed: 0 };
  const publish = (phase: 'resolving' | 'writing' | 'done' | 'cancelled' | 'error', message?: string, messageValues?: Record<string, string | number>) => {
    if (!ownsPlayer()) {
      if (phase !== 'resolving' && phase !== 'writing') abandonBulkProgress(deps, action.action);
      return;
    }
    setState((prev) => ({ ...prev, bulkActionProgress: { action: action.action, ...counts, processed: counts.completed, phase, message: message ?? null, messageValues } }));
  };
  const countValues = () => ({ succeeded: counts.succeeded, failed: counts.failed, processed: counts.completed, total: counts.total });
  return { counts, publish, countValues };
};

const validateBulkPlaylist = async (
  api: RemoteApi, name: string, isCancelled: () => boolean,
  { publish, countValues }: ReturnType<typeof createBulkProgress>,
) => {
  let playlists: Playlist[];
  try { playlists = await api.playlists(); }
  catch (error: any) {
    if (isCancelled()) publish('cancelled', 'Stopped. {succeeded} succeeded, {failed} failed, {processed} processed of {total}. Completed changes remain applied.', countValues());
    else publish('error', 'Could not load playlists.');
    return false;
  }
  if (isCancelled()) { publish('cancelled', 'Stopped. {succeeded} succeeded, {failed} failed, {processed} processed of {total}. Completed changes remain applied.', countValues()); return false; }
  const issue = playlistNameIssue(name, playlists.map((playlist) => playlist.name));
  if (!name || issue) { publish('error', issue || 'Enter a playlist name.'); return false; }
  return true;
};

const writeBulkAction = async (
  deps: SessionBulkActionsDependencies,
  api: RemoteApi, action: BulkActionRequest, name: string, songs: Awaited<ReturnType<typeof resolveBulkSongs>>,
  catalogRevision: string | null, isCancelled: () => boolean, ownsPlayer: () => boolean,
  { counts, publish, countValues }: ReturnType<typeof createBulkProgress>, queue: BulkQueueWrite,
) => {
  const { shared: { currentLibraryCategoryRef, stateRef }, loadLibraryCategory } = deps;
  publish('writing');
  let writeItems = songs;
  if (action.action === 'random') writeItems = [songs[Math.floor(Math.random() * songs.length)]];
  const write = async ({ song }: typeof writeItems[number]) => {
    if (action.action === 'favorite') await api.setFavorite(Boolean(action.favorite), song.index, catalogRevision);
    else if (action.action === 'queue' || action.action === 'random') await confirmBulkQueueAppend(api, song.index, catalogRevision, isCancelled, queue);
    else if (action.action === 'playlist') await api.addToPlaylist(action.key!, song.index);
    else if (action.action === 'createPlaylist') await api.addToPlaylist(name, song.index);
  };
  const onProgress = (result: { processed: number; succeeded: number; failed: number }) => {
    counts.completed = result.processed; counts.succeeded = result.succeeded; counts.failed = result.failed;
    if (counts.completed % 5 === 0 || counts.completed === counts.total || counts.failed > 0) publish('writing');
  };
  let result: BulkWriteCounts;
  if (action.action === 'createPlaylist') {
    const playlistJob = await runPlaylistCreationJob(() => api.createEmptyPlaylist(name), writeItems, isCancelled, write, onProgress);
    result = playlistJob.counts;
    if (!playlistJob.created && !isCancelled()) {
      publish('error', 'Playlist was not created; 0 songs added of {total}. {error} No existing playlist was changed.', { total: counts.total, error: playlistJob.error instanceof Error ? playlistJob.error.message : '' });
      return;
    }
    if (playlistJob.created && result.processed === 0 && isCancelled()) {
      publish('cancelled', 'Playlist created; no songs were added.');
      return;
    }
  } else result = await runSerialBulkWrites(writeItems, isCancelled, write, onProgress);
  counts.completed = result.processed; counts.succeeded = result.succeeded; counts.failed = result.failed;
  if (isCancelled()) publish('cancelled', queue.mayComplete
    ? 'Stopped. {succeeded} succeeded, {failed} failed, {processed} processed of {total}. The current queue add may still finish; refresh the queue before retrying.'
    : 'Stopped. {succeeded} succeeded, {failed} failed, {processed} processed of {total}. Completed changes remain applied.', countValues());
  else if (counts.failed) publish('error', '{succeeded} succeeded, {failed} failed, {processed} processed of {total}. {error} Completed changes remain applied.', { ...countValues(), error: result.error instanceof Error ? result.error.message : '' });
  else publish('done', '{succeeded} succeeded, {failed} failed, {processed} processed of {total}.', countValues());
  if (action.action === 'createPlaylist' && ownsPlayer() && currentLibraryCategoryRef.current === LibraryCategory.Playlists && !stateRef.current.libraryIsNested) loadLibraryCategory(LibraryCategory.Playlists, api);
};

const runBulkAction = async (deps: SessionBulkActionsDependencies, action: BulkActionRequest) => {
  const { ownsCurrentPlayer, refreshQueue, revalidateRatingAlbums } = deps;
  const {
    activeCatalogRef, bulkActionBusyRef, bulkActionCancelledRef, bulkActionRunRef,
    libraryLoadGenerationRef,
  } = deps.shared;
  const target = getBulkActionTarget(deps, action);
  if (!target) return;
  const { api, selection, name } = target;
  bulkActionBusyRef.current = true;
  bulkActionCancelledRef.current = false;
  const run = ++bulkActionRunRef.current;
  const catalogRevision = activeCatalogRef.current?.revision ?? null;
  const libraryGeneration = libraryLoadGenerationRef.current;
  const isCancelled = () => bulkActionCancelledRef.current || run !== bulkActionRunRef.current || !selection.ownsSource() ||
    libraryGeneration !== libraryLoadGenerationRef.current;
  const ownsPlayer = ownsCurrentPlayer();
  const progress = createBulkProgress(deps, action, ownsPlayer);
  const { counts, publish, countValues } = progress;
  const queue: BulkQueueWrite = { snapshot: null, cursor: null, needsRefresh: false, mayComplete: false };

  try {
    publish('resolving');
    if (action.action === 'createPlaylist' && !await validateBulkPlaylist(api, name, isCancelled, progress)) return;
    const songs = await resolveBulkSongs(api, selection.targets, isCancelled);
    counts.total = songs.length;
    if (action.action === 'random') counts.total = songs.length ? 1 : 0;
    if (isCancelled()) { publish('cancelled', 'Stopped. {succeeded} succeeded, {failed} failed, {processed} processed of {total}. Completed changes remain applied.', countValues()); return; }
    if (counts.total === 0) { publish('done', 'No songs were found in the selected items.'); return; }
    await writeBulkAction(deps, api, action, name, songs, catalogRevision, isCancelled, ownsPlayer, progress, queue);
  } catch (err: any) {
    if (ownsPlayer()) publish(isCancelled() ? 'cancelled' : 'error', isCancelled()
      ? 'Stopped. {succeeded} succeeded, {failed} failed, {processed} processed of {total}. Completed changes remain applied.'
      : '{succeeded} succeeded, {failed} failed, {processed} processed of {total}. {error} Completed changes remain applied.', isCancelled() ? countValues() : { ...countValues(), error: err?.message || 'Could not complete the selected action.' });
  } finally {
    if (queue.needsRefresh && ownsPlayer()) await refreshQueue(api);
    if (action.action === 'favorite' && counts.succeeded > 0 && ownsPlayer()) void revalidateRatingAlbums(api);
    if (run === bulkActionRunRef.current) {
      bulkActionBusyRef.current = false;
      bulkActionCancelledRef.current = false;
    }
  }
};

export function createSessionBulkActions(deps: SessionBulkActionsDependencies) {
  return {
    loadBulkPlaylists: loadBulkPlaylists.bind(undefined, deps),
    cancelBulkAction: cancelBulkAction.bind(undefined, deps),
    abandonBulkProgress: abandonBulkProgress.bind(undefined, deps),
    runBulkAction: runBulkAction.bind(undefined, deps),
  };
}
