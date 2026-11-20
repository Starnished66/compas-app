import type { createLibraryLists } from './libraryLists';
import type { SessionState } from './useSessionRefs';
import { sameCatalogRevision } from './librarySnapshot';
import { ContentStatus, LibraryCategory } from '../data/types';
import { RemoteApi } from '../data/RemoteApi';
import { LibraryContext } from './LibraryEntryFactory';

interface LibraryNavigationDependencies extends
  Pick<ReturnType<typeof createLibraryLists>, 'loadLibraryCategory'> {
  shared: Pick<SessionState,
    'activeCatalogRef' | 'activePlaylistRef' | 'apiRef' | 'currentLibraryCategoryRef'
    | 'extensionPageRef' | 'libraryBackStackRef' | 'libraryBrowseCatalogRef' | 'libraryContextRef'
    | 'libraryLoadGenerationRef' | 'libraryPageLoadingRef' | 'libraryPageRef' | 'screenBackStackRef'
    | 'setState' | 'shownLibraryListRef' | 'sortingEpochRef' | 'stateRef' | 'transferSearchQueryRef'
  >;
  refreshSortedView: (api: RemoteApi, context?: LibraryContext | null, nested?: boolean, nestedTitle?: string | null | undefined) => void;
  restartCatalogBrowse: (api: RemoteApi, isNested: boolean, query: string) => void;
  returnToRatingAlbums: (api: RemoteApi) => void;
  stopSearchReads: (keepVerified?: boolean) => void;
}

const pushLibraryState = (deps: LibraryNavigationDependencies) => {
  const {
    activePlaylistRef, currentLibraryCategoryRef, extensionPageRef, libraryBackStackRef,
    libraryBrowseCatalogRef, libraryContextRef, libraryLoadGenerationRef, libraryPageLoadingRef,
    libraryPageRef, setState, shownLibraryListRef, sortingEpochRef, stateRef,
  } = deps.shared;
  const { stopSearchReads } = deps;
  const cursor = extensionPageRef.current;
  const cancelsContinuation = (cursor?.kind === 'orderedAlbums' || cursor?.kind === 'folder') &&
    stateRef.current.libraryEntries.length > 0 && libraryPageLoadingRef.current === libraryLoadGenerationRef.current;
  libraryBackStackRef.current.push({
    sortEpoch: sortingEpochRef.current,
    catalog: libraryBrowseCatalogRef.current,
    category: currentLibraryCategoryRef.current,
    entries: stateRef.current.libraryEntries,
    query: stateRef.current.libraryQuery,
    status: cancelsContinuation && stateRef.current.libraryStatus === ContentStatus.Loading
      ? ContentStatus.Ready : stateRef.current.libraryStatus,
    countLabel: stateRef.current.libraryCountLabel,
    hasMore: stateRef.current.libraryHasMore,
    isNested: stateRef.current.libraryIsNested,
    nestedTitle: stateRef.current.libraryNestedTitle,
    context: libraryContextRef.current,
    total: stateRef.current.queueTotal,
    page: libraryPageRef.current,
    extensionPage: extensionPageRef.current,
    listKey: shownLibraryListRef.current,
    activePlaylist: activePlaylistRef.current,
    playlistRevision: stateRef.current.playlistRevision ?? null,
    folderPath: stateRef.current.folderPath,
    folderRoot: stateRef.current.folderRoot,
  });
  if (extensionPageRef.current?.kind === 'orderedAlbums') extensionPageRef.current = null;
  libraryBrowseCatalogRef.current = null;
  if (currentLibraryCategoryRef.current === LibraryCategory.Search && !stateRef.current.libraryIsNested) stopSearchReads();
  else libraryLoadGenerationRef.current++;
  shownLibraryListRef.current = null;
  setState((prev) => ({ ...prev, libraryIsNested: true }));
};

const navigateBack = (deps: LibraryNavigationDependencies) => {
  const {
    activeCatalogRef, activePlaylistRef, apiRef, currentLibraryCategoryRef, extensionPageRef,
    libraryBackStackRef, libraryBrowseCatalogRef, libraryContextRef, libraryLoadGenerationRef,
    libraryPageRef, screenBackStackRef, setState, shownLibraryListRef, sortingEpochRef, stateRef,
    transferSearchQueryRef,
  } = deps.shared;
  const { loadLibraryCategory, refreshSortedView, restartCatalogBrowse, returnToRatingAlbums } = deps;
  const view = stateRef.current;
  if (view.screen.type === 'Queue') {
    const screenUnderQueue = screenBackStackRef.current.pop() ?? { type: 'Home' };
    setState((curr) => ({ ...curr, screen: screenUnderQueue }));
    const api = apiRef.current;
    if (api && screenUnderQueue.type === 'Library' && screenUnderQueue.category === LibraryCategory.Albums &&
        !stateRef.current.libraryIsNested) returnToRatingAlbums(api);
    return;
  }

  if (view.libraryIsNested && libraryBackStackRef.current.length > 0) {
    const prev = libraryBackStackRef.current.pop()!;
    const api = apiRef.current;
    const reload = api !== null && prev.catalog !== null && !sameCatalogRevision(prev.catalog, activeCatalogRef.current);
    currentLibraryCategoryRef.current = prev.category;
    libraryBrowseCatalogRef.current = prev.catalog;
    libraryContextRef.current = prev.context;
    libraryPageRef.current = prev.page;
    extensionPageRef.current = prev.extensionPage;
    activePlaylistRef.current = prev.activePlaylist;
    shownLibraryListRef.current = prev.listKey;
    libraryLoadGenerationRef.current++;
    setState((curr) => ({
      ...curr,
      libraryEntries: reload ? [] : prev.entries,
      libraryQuery: prev.query,
      libraryStatus: reload ? ContentStatus.Loading : prev.status,
      libraryCountLabel: reload ? null : prev.countLabel,
      libraryHasMore: !reload && prev.hasMore,
      libraryIsNested: prev.isNested,
      libraryNestedTitle: prev.nestedTitle,
      activePlaylist: prev.activePlaylist,
      playlistRevision: prev.playlistRevision,
      folderPath: prev.folderPath,
      folderRoot: prev.folderRoot,
    }));
    if (api && reload) restartCatalogBrowse(api, prev.isNested, prev.query);
    else if (api && prev.sortEpoch !== sortingEpochRef.current) refreshSortedView(api, prev.context, prev.isNested, prev.nestedTitle);
    else if (api && !prev.isNested && prev.extensionPage?.kind === 'orderedAlbums') returnToRatingAlbums(api);
    return;
  }

  if (screenBackStackRef.current.length > 0) {
    const prevScreen = screenBackStackRef.current.pop()!;
    setState((curr) => ({ ...curr, screen: prevScreen, libraryIsNested: false }));
    if (prevScreen.type !== 'Library') return;
    const api = apiRef.current;
    if (prevScreen.category === LibraryCategory.Search) {
      const query = transferSearchQueryRef.current;
      if (api && view.screen.type === 'Transfer' && query) void loadLibraryCategory(LibraryCategory.Search, api, query);
    } else if (prevScreen.category !== currentLibraryCategoryRef.current) loadLibraryCategory(prevScreen.category);
    else if (api && prevScreen.category === LibraryCategory.Albums) returnToRatingAlbums(api);
    return;
  }

  setState((curr) => ({ ...curr, screen: { type: 'Home' }, libraryIsNested: false }));
};

export function createLibraryNavigation(deps: LibraryNavigationDependencies) {
  return {
    pushLibraryState: pushLibraryState.bind(undefined, deps),
    navigateBack: navigateBack.bind(undefined, deps),
  };
}
