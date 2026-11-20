import { createSongActions } from './songActions';
import { createSessionBulkActions } from './sessionBulkActions';
import { createSessionPlaylists } from './sessionPlaylists';
import { useSessionRating } from './useSessionRating';
import { createLibraryEditActions } from './libraryEditActions';
import { useLazyRef } from './useLazyRef';
import type { useLibraryBrowser } from './useLibraryBrowser';
import type { useRemoteQueue } from './useRemoteQueue';
import type { useSessionArtwork } from './useSessionArtwork';
import type { SessionState } from './useSessionRefs';

type SessionEditsDependencies = { shared: SessionState }
  & Pick<ReturnType<typeof useLibraryBrowser>,
    'browsePlaylist' | 'libraryRow' | 'libraryTarget' | 'loadLibraryCategory' | 'revalidateRatingAlbums'
  >
  & Pick<ReturnType<typeof useRemoteQueue>, 'refreshQueue' | 'reconcileQueueAfterWrite'>
  & Pick<ReturnType<typeof useSessionArtwork>, 'ownsCurrentPlayer'>;

export function useSessionEdits({
  shared, browsePlaylist, libraryRow, libraryTarget, loadLibraryCategory, revalidateRatingAlbums,
  refreshQueue, reconcileQueueAfterWrite, ownsCurrentPlayer,
}: SessionEditsDependencies) {
  const rating = useSessionRating({ shared, loadLibraryCategory, revalidateRatingAlbums });
  const songs = createSongActions({ shared, browsePlaylist, libraryTarget, loadLibraryCategory, reconcileQueueAfterWrite });
  const bulk = createSessionBulkActions({ shared, loadLibraryCategory, refreshQueue, ownsCurrentPlayer, revalidateRatingAlbums });
  const actions = useLazyRef(() => {
    const playlists = createSessionPlaylists({ shared, browsePlaylist, loadLibraryCategory, closeSongActions: songs.closeSongActions });
    return createLibraryEditActions({
      shared, libraryRow, ownsCurrentPlayer, setTrackRating: rating.setTrackRating,
      loadBulkPlaylists: bulk.loadBulkPlaylists, runBulkAction: bulk.runBulkAction, cancelBulkAction: bulk.cancelBulkAction,
      ...songs, ...playlists,
    });
  }).current;

  return {
    currentRatingEdit: rating.currentRatingEdit,
    closeSongActions: songs.closeSongActions,
    abandonBulkProgress: bulk.abandonBulkProgress,
    ...actions,
  };
}
