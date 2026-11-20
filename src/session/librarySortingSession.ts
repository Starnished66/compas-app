import type { createLibraryLists } from './libraryLists';
import type { SessionState } from './useSessionRefs';
import { LibraryCategory, LibrarySortScope, LibrarySortMode, LibrarySortingSnapshot } from '../data/types';
import { RemoteApi } from '../data/RemoteApi';
import { LibraryContext } from './LibraryEntryFactory';
import { buildCollectionPlaybackRequest } from './collectionPlaybackRequest';
import { requestLibrarySortChange } from './librarySorting';

interface LibrarySortingSessionDependencies extends
  Pick<ReturnType<typeof createLibraryLists>, 'loadLibraryCategory'> {
  shared: Pick<SessionState,
    'activeCatalogRef' | 'activePlaylistRef' | 'apiRef' | 'bulkActionBusyRef' | 'collectionPendingRef'
    | 'collectionStartTokenRef' | 'collectionStartingRef' | 'connectionAttemptRef'
    | 'currentLibraryCategoryRef' | 'featureSetRef' | 'libraryContextRef' | 'libraryListCacheRef'
    | 'libraryPageRef' | 'librarySortingRef' | 'setState' | 'sortingEpochRef' | 'sortingWriteRef'
    | 'stateRef'
  >;
  loadGroupAlbums: (context: LibraryContext) => Promise<void>;
}

const refreshSortedView = (
  deps: LibrarySortingSessionDependencies,
  api: RemoteApi,
  context = deps.shared.libraryContextRef.current,
  nested = deps.shared.stateRef.current.libraryIsNested,
  nestedTitle = deps.shared.stateRef.current.libraryNestedTitle,
) => {
  const { apiRef, currentLibraryCategoryRef, libraryListCacheRef, stateRef } = deps.shared;
  const { loadGroupAlbums, loadLibraryCategory } = deps;
  libraryListCacheRef.current.clear();
  if (api !== apiRef.current || stateRef.current.screen.type !== 'Library') return;
  if (nested && nestedTitle === 'Albums' && context) {
    void loadGroupAlbums(context);
  } else if (!nested && currentLibraryCategoryRef.current === LibraryCategory.Albums) {
    void loadLibraryCategory(LibraryCategory.Albums, api, null, true);
  }
};

const publishLibrarySorting = (deps: LibrarySortingSessionDependencies, api: RemoteApi, sorting: LibrarySortingSnapshot) => {
  const { apiRef, librarySortingRef, setState, sortingEpochRef } = deps.shared;
  if (api !== apiRef.current) return;
  if (JSON.stringify(librarySortingRef.current) === JSON.stringify(sorting)) return;
  librarySortingRef.current = sorting;
  sortingEpochRef.current++;
  setState((prev) => ({ ...prev, librarySorting: sorting }));
  refreshSortedView(deps, api);
};

const refreshLibrarySorting = async (deps: LibrarySortingSessionDependencies, api: RemoteApi) => {
  const { apiRef, connectionAttemptRef, sortingWriteRef } = deps.shared;
  const attempt = connectionAttemptRef.current;
  try {
    const sorting = await api.librarySorting();
    if (api === apiRef.current && attempt === connectionAttemptRef.current && !sortingWriteRef.current) publishLibrarySorting(deps, api, sorting);
  } catch { /* An optional ordering refresh must not disconnect playback. */ }
};

const setLibrarySorting = async (deps: LibrarySortingSessionDependencies, scope: LibrarySortScope, mode: LibrarySortMode) => {
  const {
    apiRef, connectionAttemptRef, featureSetRef, librarySortingRef, setState, sortingWriteRef,
  } = deps.shared;
  const api = apiRef.current;
  const current = librarySortingRef.current;
  if (!api || !current || sortingWriteRef.current || !featureSetRef.current.has('library_sorting')) return;
  const attempt = connectionAttemptRef.current;
  const isCurrent = () => api === apiRef.current && attempt === connectionAttemptRef.current;
  sortingWriteRef.current = true;
  try {
    const sorting = await requestLibrarySortChange(api, current, scope, mode, isCurrent);
    if (sorting && isCurrent()) publishLibrarySorting(deps, api, sorting);
  } catch (error: any) {
    if (isCurrent()) setState((prev) => ({ ...prev, connectionMessage: error.message || 'Could not change sorting' }));
  } finally { sortingWriteRef.current = false; }
};

const playNativeCollection = async (deps: LibrarySortingSessionDependencies, shuffle: boolean) => {
  const {
    activeCatalogRef, activePlaylistRef, apiRef, bulkActionBusyRef, collectionPendingRef,
    collectionStartTokenRef, collectionStartingRef, connectionAttemptRef, currentLibraryCategoryRef,
    featureSetRef, libraryContextRef, libraryPageRef, setState, stateRef,
  } = deps.shared;
  const api = apiRef.current;
  if (!api || collectionStartingRef.current || collectionPendingRef.current || bulkActionBusyRef.current || !featureSetRef.current.has('collection_playback')) return;
  const view = stateRef.current;
  const page = libraryPageRef.current;
  const request = buildCollectionPlaybackRequest({ category: currentLibraryCategoryRef.current,
    nestedTitle: view.libraryNestedTitle, isNested: view.libraryIsNested, query: view.libraryQuery,
    playlist: activePlaylistRef.current, libraryContext: libraryContextRef.current,
    pageFilter: page?.filter, albumIdentity: page?.albumIdentity, playbackMode: view.playbackMode,
    catalogRevision: activeCatalogRef.current?.revision ?? null,
    supportsShuffleModes: featureSetRef.current.has('shuffle_modes'), shuffle });
  if (!request) return;
  const attempt = connectionAttemptRef.current;
  const startToken = ++collectionStartTokenRef.current;
  collectionStartingRef.current = true;
  setState((prev) => ({ ...prev, collectionBusy: true, connectionMessage: null }));
  try {
    if (!request.catalogRevision) {
      const catalog = await api.catalog(0, 1);
      if (api !== apiRef.current || attempt !== connectionAttemptRef.current) return;
      request.catalogRevision = catalog.revision;
    }
    const id = await api.playCollection(request);
    if (api !== apiRef.current || attempt !== connectionAttemptRef.current) return;
    collectionPendingRef.current = { id, api, attempt, startedAt: Date.now() };
  } catch (error: any) {
    if (api === apiRef.current && attempt === connectionAttemptRef.current) setState((prev) => ({ ...prev, collectionBusy: false, connectionMessage: error.message || 'Could not play collection' }));
  } finally { if (startToken === collectionStartTokenRef.current) collectionStartingRef.current = false; }
};

export function createLibrarySortingSession(deps: LibrarySortingSessionDependencies) {
  return {
    refreshSortedView: refreshSortedView.bind(undefined, deps),
    refreshLibrarySorting: refreshLibrarySorting.bind(undefined, deps),
    setLibrarySorting: setLibrarySorting.bind(undefined, deps),
    playNativeCollection: playNativeCollection.bind(undefined, deps),
  };
}
