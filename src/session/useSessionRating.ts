import type { createLibraryLists } from './libraryLists';
import type { SessionState } from './useSessionRefs';
import { LibraryCategory } from '../data/types';
import { RemoteApi } from '../data/RemoteApi';
import { RequestCancelledError } from '../data/HttpTransport';
import { sameSong } from '../ui/trackKey';
import { RATING_TIMEOUT_ERROR, useCurrentRatingEdit } from './trackRating';
import type { ExtensionPage } from './LibraryListCache';

interface SessionRatingDependencies extends Pick<ReturnType<typeof createLibraryLists>, 'loadLibraryCategory'> {
  shared: Pick<SessionState,
    'apiRef' | 'currentLibraryCategoryRef' | 'currentTrackRef' | 'featureSetRef' | 'playerSessionRef'
    | 'setState' | 'songActionTargetRef'
  >;
  revalidateRatingAlbums: (api: RemoteApi, reopening?: boolean, restored?: ExtensionPage | null | undefined) => Promise<void>;
}

export function useSessionRating(deps: SessionRatingDependencies) {
  const { loadLibraryCategory, revalidateRatingAlbums } = deps;
  const {
    apiRef, currentLibraryCategoryRef, currentTrackRef, featureSetRef, playerSessionRef, setState,
    songActionTargetRef,
  } = deps.shared;

  // A verified Wi-Fi handoff keeps the same player session even though its API and address change.
  const ratingPlayerSession = () => apiRef.current ? playerSessionRef.current : undefined;

  const setTrackRating = async (rating: number, current: boolean, reportError = true,
    track = currentTrackRef.current, signal?: AbortSignal, confirm?: () => boolean, expired?: () => boolean) => {
    const api = apiRef.current;
    const target = current ? null : songActionTargetRef.current;
    const stars = featureSetRef.current.has('ratings_edit');
    if (!api || (!stars && !featureSetRef.current.has('favorites_edit')) || (!current && (!target || target.song.index < 1))) return;
    const playerSession = ratingPlayerSession();
    try {
      const index = target?.song.index;
      const revision = target?.catalogRevision;
      const saved = stars ? await api.setRating(index, rating, revision, signal)
        : (await api.setFavorite(rating > 0, index, revision, signal)) ? 5 : 0;
      const activeApi = apiRef.current;
      if (!activeApi || playerSession !== ratingPlayerSession()) return;
      if (current ? sameSong(currentTrackRef.current, track) && confirm?.() : songActionTargetRef.current === target) {
        const field = current ? 'currentRating' : 'songActionRating';
        setState((prev) => ({ ...prev, [field]: saved, connectionMessage: null }));
      }
      void revalidateRatingAlbums(activeApi);
      if (!current && currentLibraryCategoryRef.current === LibraryCategory.Favorites) {
        await loadLibraryCategory(LibraryCategory.Favorites, activeApi);
      }
      return { rating: saved };
    } catch (err: any) {
      // An edit that already ended has reported its outcome. A write cancelled in the queue was never sent.
      if (playerSession !== ratingPlayerSession() || expired?.()) return;
      const error: string = err instanceof RequestCancelledError ? RATING_TIMEOUT_ERROR
        : err?.message || (stars ? 'Could not update rating' : 'Could not update favorite');
      if (reportError) setState((prev) => ({ ...prev, connectionMessage: error }));
      return { error };
    }
  };

  const currentRatingEdit = useCurrentRatingEdit({
    current: () => ({ playerSession: ratingPlayerSession(), track: currentTrackRef.current,
      stars: featureSetRef.current.has('ratings_edit') }),
    publish: (pendingCurrentRating) => setState((prev) => ({ ...prev, pendingCurrentRating })),
    reportTimeout: (connectionMessage) => setState((prev) => ({ ...prev, connectionMessage })),
    write: (rating, track, reportError, signal, confirm, expired) =>
      setTrackRating(rating, true, reportError, track, signal, confirm, expired),
  });

  return { setTrackRating, currentRatingEdit };
}
