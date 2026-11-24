import type { createLibraryLists } from './libraryLists';
import type { SessionState } from './useSessionRefs';
import { sameCatalogRevision } from './librarySnapshot';
import { ContentStatus, LibraryCategory, LibraryGroup, RemoteScreen } from '../data/types';
import { RemoteApi } from '../data/RemoteApi';
import { LibraryContext } from './LibraryEntryFactory';

interface LibraryNavigationDependencies extends
  Pick<ReturnType<typeof createLibraryLists>, 'loadLibraryCategory'> {
  shared: Pick<SessionState,
    'activeCatalogRef' | 'activePlaylistRef' | 'apiRef' | 'currentLibraryCategoryRef'
    | 'extensionPageRef' | 'libraryBackStackRef' | 'libraryBrowseCatalogRef' | 'libraryContextRef' | 'libraryEntriesRef'
    | 'libraryLoadGenerationRef' | 'libraryPageLoadingRef' | 'libraryPageRef' | 'screenBackStackRef'
    | 'searchDebounceRef' | 'setState' | 'shownLibraryListRef' | 'sortingEpochRef' | 'stateRef'
    | 'transferSearchQueryRef'
  >;
  refreshSortedView: (api: RemoteApi, context?: LibraryContext | null, nested?: boolean, nestedTitle?: string | null | undefined) => void;
  restartCatalogBrowse: (api: RemoteApi, isNested: boolean, query: string) => void;
  returnToRatingAlbums: (api: RemoteApi) => void;
  stopSearchReads: (keepVerified?: boolean) => void;
}

/**
 * Go to Album / Go to Artist replace the Library's content from wherever the user is. Each jump keeps only the
 * screen it left and which Library list it replaced; Back from the jumped-to view returns to that screen and
 * reloads that list from scratch instead of restoring any saved state. Consecutive jumps stack.
 */
interface CatalogJump {
  returnScreen: RemoteScreen;
  replacedCategory: LibraryCategory;
  replacedQuery: string;
}
type CatalogJumpRef = { current: CatalogJump[]; serial: number };

/** Drops jumps whose return screen is no longer in the screen history (Home, reconnects and the like clear it). */
const reachableJumps = (jumpRef: CatalogJumpRef, screens: readonly RemoteScreen[]) => {
  jumpRef.current = jumpRef.current.filter((jump) => screens.includes(jump.returnScreen));
  return jumpRef.current;
};

/** Opens `category` as a fresh Library view; `album` is the album the jump lands on, for the screen's header. */
const beginCatalogJump = (
  deps: LibraryNavigationDependencies, jumpRef: CatalogJumpRef, category: LibraryCategory, album?: LibraryGroup,
) => {
  const {
    activePlaylistRef, currentLibraryCategoryRef, extensionPageRef, libraryBackStackRef, libraryBrowseCatalogRef,
    libraryContextRef, libraryEntriesRef, libraryLoadGenerationRef, libraryPageRef, screenBackStackRef,
    searchDebounceRef, setState, shownLibraryListRef, stateRef,
  } = deps.shared;
  const view = stateRef.current;
  // A search still waiting to run already owns the Library, even before the category ref catches up.
  const pendingSearch = searchDebounceRef.current;
  const replacedCategory = pendingSearch ? LibraryCategory.Search : currentLibraryCategoryRef.current;
  const replacedQuery = replacedCategory === LibraryCategory.Search
    ? (pendingSearch?.query ?? view.libraryQuery).trim() : '';
  deps.stopSearchReads();
  libraryLoadGenerationRef.current++;
  screenBackStackRef.current.push(view.screen);
  reachableJumps(jumpRef, screenBackStackRef.current).push({ returnScreen: view.screen, replacedCategory, replacedQuery });
  libraryBackStackRef.current = [];
  currentLibraryCategoryRef.current = category;
  libraryContextRef.current = null;
  libraryPageRef.current = null;
  extensionPageRef.current = null;
  activePlaylistRef.current = null;
  libraryBrowseCatalogRef.current = null;
  shownLibraryListRef.current = null;
  const catalogJump = { id: ++jumpRef.serial, album: album ? libraryEntriesRef.current.albums([album], null)[0] : null };
  setState((prev) => ({
    ...prev,
    screen: { type: 'Library', category },
    catalogJump,
    songActionsVisible: false,
    libraryIsNested: true,
    libraryNestedTitle: null,
    libraryEntries: [],
    libraryCountLabel: null,
    libraryHasMore: false,
    libraryStatus: ContentStatus.Loading,
    libraryQuery: '',
    connectionMessage: null,
    activePlaylist: null,
    playlistRevision: null,
    folderPath: '',
  }));
};

/** Back from the jumped-to view: return to the jump's screen and reload the Library list the jump replaced. */
const returnFromCatalogJump = (deps: LibraryNavigationDependencies, jumpRef: CatalogJumpRef): boolean => {
  const { apiRef, libraryBackStackRef, libraryLoadGenerationRef, screenBackStackRef, setState, stateRef } = deps.shared;
  const jump = reachableJumps(jumpRef, screenBackStackRef.current).at(-1);
  if (!jump || stateRef.current.screen.type !== 'Library' || libraryBackStackRef.current.length > 0 ||
      screenBackStackRef.current.at(-1) !== jump.returnScreen) return false;
  jumpRef.current.pop();
  screenBackStackRef.current.pop();
  libraryLoadGenerationRef.current++;
  setState((curr) => ({ ...curr, screen: jump.returnScreen, libraryIsNested: false }));
  // The replaced list only matters while a Library screen is still reachable; opening one later reloads anyway.
  const libraryReachable = [jump.returnScreen, ...screenBackStackRef.current].some((screen) => screen.type === 'Library');
  const api = apiRef.current;
  if (!libraryReachable || !api) return true;
  if (jump.replacedCategory === LibraryCategory.Search) {
    void deps.loadLibraryCategory(LibraryCategory.Search, api, jump.replacedQuery || null);
  } else {
    void deps.loadLibraryCategory(jump.replacedCategory, api);
  }
  return true;
};

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

const navigateBack = (deps: LibraryNavigationDependencies, jumpRef: CatalogJumpRef) => {
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

  if (returnFromCatalogJump(deps, jumpRef)) return;

  // The Library's own history only applies while the Library is the screen on top.
  if (view.screen.type === 'Library' && view.libraryIsNested && libraryBackStackRef.current.length > 0) {
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
    // Between other screens the Library view is untouched; whether it was inside a collection matters on return.
    setState((curr) => ({
      ...curr, screen: prevScreen, libraryIsNested: prevScreen.type === 'Library' ? false : curr.libraryIsNested,
    }));
    if (prevScreen.type !== 'Library') return;
    const api = apiRef.current;
    if (view.libraryIsNested) {
      // An album, artist or playlist was open when the Library was left: come back to its category, reloaded.
      libraryBackStackRef.current = [];
      // A search Transfer interrupted is only remembered for the return from that Transfer visit.
      const pending = view.screen.type === 'Transfer' ? transferSearchQueryRef.current : '';
      const query = prevScreen.category === LibraryCategory.Search ? (pending || view.libraryQuery).trim() : '';
      if (prevScreen.category !== LibraryCategory.Search) void loadLibraryCategory(prevScreen.category);
      else if (api) void loadLibraryCategory(LibraryCategory.Search, api, query || null);
      return;
    }
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
  const jumpRef: CatalogJumpRef = { current: [], serial: 0 };
  return {
    pushLibraryState: pushLibraryState.bind(undefined, deps),
    navigateBack: navigateBack.bind(undefined, deps, jumpRef),
    beginCatalogJump: beginCatalogJump.bind(undefined, deps, jumpRef),
  };
}
