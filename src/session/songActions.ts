import type { createLibraryLists } from './libraryLists';
import type { SessionState } from './useSessionRefs';
import { ContentStatus, LibraryCategory, Playlist } from '../data/types';
import { RemoteApi } from '../data/RemoteApi';
import { EntryTarget } from './LibraryEntryFactory';
import { QUEUE_PROBE_SIZE, insertedOffset, queueEnds } from './queueInsertion';
import { readSongRating } from './trackRating';

const SWIPE_NEXT_ATTEMPTS = 8;
const SWIPE_NEXT_POLL_MS = 200;

interface SongActionsDependencies extends Pick<ReturnType<typeof createLibraryLists>, 'loadLibraryCategory'> {
  shared: Pick<SessionState,
    'activePlaylistRef' | 'apiRef' | 'bulkActionBusyRef' | 'currentLibraryCategoryRef' | 'featureSetRef'
    | 'playerSessionRef' | 'setState' | 'songActionBusyRef' | 'songActionEntryIdRef'
    | 'songActionTargetRef' | 'stateRef'
  >;
  browsePlaylist: (playlist: Playlist) => Promise<void>;
  libraryTarget: (id: string) => EntryTarget | undefined;
  reconcileQueueAfterWrite: (api: RemoteApi) => void;
}

const openSongActions = (deps: SongActionsDependencies, id: string) => {
  const { libraryTarget } = deps;
  const { apiRef, featureSetRef, playerSessionRef, setState, songActionEntryIdRef, songActionTargetRef } = deps.shared;
  const target = libraryTarget(id);
  const api = apiRef.current;
  if (target?.type !== 'Song' || !api) return;
  songActionEntryIdRef.current = id;
  songActionTargetRef.current = target;
  setState((prev) => ({
    ...prev,
    songActionsVisible: true,
    songActionTitle: target.song.title,
    songActionArtist: target.song.artist || null,
    songActionAlbum: target.song.album || null,
    songActionAlbumArtist: target.song.albumArtist || null,
    songActionAlbumKey: target.song.albumKey ?? null,
    songActionSongId: target.song.index > 0 ? target.song.index : null,
    playlistOptions: [],
    playlistOptionsStatus: ContentStatus.Ready,
    songActionRating: null,
    songActionPosition: target.song.position ?? null,
    connectionMessage: null,
  }));
  const index = target.song.index;
  const ratings = featureSetRef.current.has('ratings_edit');
  const playerSession = playerSessionRef.current;
  if (index > 0 && (ratings || featureSetRef.current.has('favorites_edit'))) {
    readSongRating(api, index, ratings).then((rating) => {
      if (apiRef.current && playerSession === playerSessionRef.current && songActionEntryIdRef.current === id) {
        setState((prev) => prev.songActionRating == null ? { ...prev, songActionRating: rating } : prev);
      }
    }).catch(() => {});
  }
};

const loadSongPlaylists = async (deps: SongActionsDependencies) => {
  const { apiRef, playerSessionRef, setState, songActionEntryIdRef } = deps.shared;
  const id = songActionEntryIdRef.current;
  const api = apiRef.current;
  if (!id || !api) return;
  const playerSession = playerSessionRef.current;
  const ownsSheet = () => apiRef.current && playerSession === playerSessionRef.current && songActionEntryIdRef.current === id;
  setState((prev) => ({ ...prev, playlistOptionsStatus: ContentStatus.Loading }));
  try {
    const playlists = await api.playlists();
    if (!ownsSheet()) return;
    setState((prev) => ({ ...prev, playlistOptions: playlists.filter((p) => p.writable), playlistOptionsStatus: ContentStatus.Ready }));
  } catch (err: any) {
    if (!ownsSheet()) return;
    setState((prev) => ({ ...prev, playlistOptionsStatus: ContentStatus.Error, connectionMessage: err?.message || 'Could not load playlists' }));
  }
};

const closeSongActions = (deps: SongActionsDependencies) => {
  const { setState, songActionEntryIdRef, songActionTargetRef } = deps.shared;
  songActionEntryIdRef.current = null;
  songActionTargetRef.current = null;
  setState((prev) => ({ ...prev, songActionsVisible: false }));
};

const runSongAction = async (deps: SongActionsDependencies, kind: 'queue' | 'playlist' | 'create', value?: string) => {
  const { browsePlaylist, loadLibraryCategory, reconcileQueueAfterWrite } = deps;
  const {
    activePlaylistRef, apiRef, bulkActionBusyRef, currentLibraryCategoryRef, setState,
    songActionBusyRef, songActionEntryIdRef, songActionTargetRef, stateRef,
  } = deps.shared;
  if (bulkActionBusyRef.current) return;
  const id = songActionEntryIdRef.current;
  const target = songActionTargetRef.current;
  const api = apiRef.current;
  if (target?.type !== 'Song' || !api || songActionBusyRef.current) return;
  songActionBusyRef.current = true;
  try {
    if (kind === 'queue') {
      await api.addToQueue(target.song.index, target.catalogRevision);
      reconcileQueueAfterWrite(api);
    } else if (kind === 'playlist' && value) {
      await api.addToPlaylist(value, target.song.index);
    } else if (kind === 'create' && value) {
      await api.createPlaylist(value.trim(), target.song.index);
    } else return;
    if (api !== apiRef.current) return;
    if (songActionEntryIdRef.current === id) closeSongActions(deps);
    if (kind === 'create' && currentLibraryCategoryRef.current === LibraryCategory.Playlists && !stateRef.current.libraryIsNested) {
      loadLibraryCategory(LibraryCategory.Playlists, api);
    } else if (kind === 'playlist' && activePlaylistRef.current?.key === value) {
      const activePlaylist = activePlaylistRef.current;
      if (activePlaylist) browsePlaylist(activePlaylist);
    }
  } catch (err: any) {
    if (api !== apiRef.current) return;
    setState((prev) => ({ ...prev, connectionMessage: err?.message || 'Could not update the player' }));
  } finally {
    songActionBusyRef.current = false;
  }
};

// Swipe actions on a song row: append it, or append and then move it to the top of Up next.
// The player has no insert-next request; one queue edit is accepted per published revision.
const swipeSong = async (deps: SongActionsDependencies, id: string, kind: 'queue' | 'next') => {
  const { shared: { apiRef, featureSetRef, setState }, libraryTarget, reconcileQueueAfterWrite } = deps;
  const api = apiRef.current;
  const target = libraryTarget(id);
  if (!api || target?.type !== 'Song') return;
  // Clear first so a repeated failure reads as a new message.
  setState((prev) => (prev.connectionMessage ? { ...prev, connectionMessage: null } : prev));
  if (kind === 'next' && !featureSetRef.current.has('queue_edit')) {
    setState((prev) => ({ ...prev, connectionMessage: 'This player can’t reorder its queue, so songs can only be added to the end.' }));
    return;
  }
  try {
    const readEnds = async () => {
      const head = await api.queue(0, QUEUE_PROBE_SIZE);
      const tail = head.total > QUEUE_PROBE_SIZE ? await api.queue(head.total - QUEUE_PROBE_SIZE, QUEUE_PROBE_SIZE) : null;
      return { ends: queueEnds(head, tail), revision: tail?.revision ?? head.revision };
    };
    const before = kind === 'next' ? await readEnds() : null;
    await api.addToQueue(target.song.index, target.catalogRevision);
    if (before) {
      let placed = false;
      for (let attempt = 0; attempt < SWIPE_NEXT_ATTEMPTS && !placed; attempt++) {
        await new Promise<void>((resolve) => setTimeout(resolve, SWIPE_NEXT_POLL_MS));
        if (api !== apiRef.current) return;
        const after = await readEnds();
        if (after.ends.total === before.ends.total) continue;
        // Move only the copy that was just added; a guess could move another song instead.
        const offset = insertedOffset(before.ends, after.ends, target.song.index);
        if (offset == null) break;
        try {
          if (offset > 0) await api.moveQueueTrack(offset, 0, after.revision);
          placed = true;
        } catch (err: any) {
          if (err?.statusCode !== 409) throw err;
          break;
        }
      }
      if (!placed) throw new Error('The song was added to the queue, but couldn’t be moved up next.');
    }
    if (api !== apiRef.current) return;
    reconcileQueueAfterWrite(api);
  } catch (err: any) {
    if (api !== apiRef.current) return;
    setState((prev) => ({ ...prev, connectionMessage: err?.message || 'Could not update the player' }));
  }
};

export function createSongActions(deps: SongActionsDependencies) {
  return {
    openSongActions: openSongActions.bind(undefined, deps),
    loadSongPlaylists: loadSongPlaylists.bind(undefined, deps),
    closeSongActions: closeSongActions.bind(undefined, deps),
    runSongAction: runSongAction.bind(undefined, deps),
    swipeSong: swipeSong.bind(undefined, deps),
  };
}
