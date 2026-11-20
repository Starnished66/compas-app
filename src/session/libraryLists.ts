import type { SessionState } from './useSessionRefs';
import { ContentStatus, LibraryCategory } from '../data/types';
import { RemoteApi } from '../data/RemoteApi';
import { CatalogIdentity } from '../data/SyncedCatalogStore';
import { ExtensionPage, LibraryList, libraryListKey, needsRevalidation } from './LibraryListCache';
import { CategoryLoadContext, loadCategoryList, supportsSplitGenres } from './libraryCategoryLoader';
import { reconcileEntries } from './reconcileEntries';
import { orderedAlbumList, pageRevision, readChangedRatingAlbums } from './orderedAlbumPaging';

interface LibraryBrowserDependencies {
  shared: Pick<SessionState,
    'activeCatalogRef' | 'activePlaylistRef' | 'apiRef' | 'connectionAttemptRef'
    | 'currentLibraryCategoryRef' | 'extensionPageRef' | 'featureSetRef' | 'libraryBrowseCatalogRef'
    | 'libraryContextRef' | 'libraryEntriesRef' | 'libraryListCacheRef' | 'libraryLoadGenerationRef'
    | 'libraryPageRef' | 'librarySortingRef' | 'screenBackStackRef' | 'searchDebounceRef'
    | 'searchReads' | 'setState' | 'shownLibraryListRef' | 'stateRef' | 'syncedCatalogStoreRef'
  >;
  recoverCatalogBrowse: (error: unknown, catalog: CatalogIdentity | null) => boolean;
}

const libraryRow = (deps: LibraryBrowserDependencies, id: string) => {
  const { libraryEntriesRef, stateRef } = deps.shared;
  return libraryEntriesRef.current.row(id, stateRef.current.libraryEntries);
};

const libraryTarget = (deps: LibraryBrowserDependencies, id: string) => {
  const { libraryEntriesRef } = deps.shared;
  return libraryEntriesRef.current.target(libraryRow(deps, id));
};

const librarySource = (deps: LibraryBrowserDependencies, catalog = deps.shared.activeCatalogRef.current): string => {
  const { connectionAttemptRef, featureSetRef } = deps.shared;
  return catalog ? `catalog:${catalog.libraryId}:${catalog.revision}:${supportsSplitGenres(featureSetRef.current)}`
    : `player:${connectionAttemptRef.current}`;
};

const libraryLoadContext = (deps: LibraryBrowserDependencies, api: RemoteApi, catalog = deps.shared.activeCatalogRef.current, search = false): CategoryLoadContext => {
  const {
    featureSetRef, libraryEntriesRef, librarySortingRef, searchReads, syncedCatalogStoreRef,
  } = deps.shared;
  return {
    api,
    catalog,
    store: syncedCatalogStoreRef.current,
    entries: libraryEntriesRef.current,
    features: featureSetRef.current,
    librarySorting: librarySortingRef.current,
    ...(search && !catalog ? { searchReads, searchSignal: searchReads.songSignal() } : {}),
  };
};

const showLibraryList = (deps: LibraryBrowserDependencies, key: string | null, list: LibraryList) => {
  const {
    extensionPageRef, libraryBrowseCatalogRef, libraryContextRef, setState, shownLibraryListRef,
  } = deps.shared;
  extensionPageRef.current = list.extensionPage;
  if (list.extensionPage) libraryBrowseCatalogRef.current = null;
  if (list.extensionPage?.kind === 'orderedAlbums') libraryContextRef.current = list.extensionPage.context;
  shownLibraryListRef.current = key;
  setState((prev) => ({
    ...prev,
    libraryEntries: list.entries,
    libraryCountLabel: list.label,
    libraryHasMore: list.hasMore,
    libraryStatus: list.entries.length > 0 ? ContentStatus.Ready : ContentStatus.Empty,
  }));
};

// `restored` is the cursor being shown again on a return, when screen state may still be in transition.
const revalidateRatingAlbums = async (deps: LibraryBrowserDependencies, api: RemoteApi, reopening = false, restored?: ExtensionPage | null) => {
  const {
    apiRef, currentLibraryCategoryRef, extensionPageRef, libraryEntriesRef, libraryListCacheRef,
    libraryLoadGenerationRef, librarySortingRef, screenBackStackRef, shownLibraryListRef, stateRef,
  } = deps.shared;
  if (api !== apiRef.current || librarySortingRef.current?.albums.effective !== 8) return;
  const source = librarySource(deps);
  const category = LibraryCategory.Albums;
  const key = libraryListKey(source, category);
  const cachedCursor = () => libraryListCacheRef.current.get(source, category)?.extensionPage;
  const generation = libraryLoadGenerationRef.current;
  const shownKey = shownLibraryListRef.current;
  const ownsList = () => generation === libraryLoadGenerationRef.current && shownKey !== null &&
    shownKey === shownLibraryListRef.current && currentLibraryCategoryRef.current === category;
  const ownsSource = () => api === apiRef.current && source === librarySource(deps) && librarySortingRef.current?.albums.effective === 8;
  const shownCursor = () => ownsList() ? extensionPageRef.current : null;
  const screen = stateRef.current.screen;
  const libraryScreen = screen.type === 'Queue' ? screenBackStackRef.current.at(-1) : screen;
  const previous = cachedCursor() ?? restored ??
    (libraryScreen?.type === 'Library' && libraryScreen.category === category ? shownCursor() : null);
  const page = await readChangedRatingAlbums(api, previous);
  if (!page || !ownsSource()) return;
  const { revision } = page;
  const cached = libraryListCacheRef.current.get(source, category);
  const cachedRevision = pageRevision(cached?.extensionPage);
  // Another check may have stored this revision already (maybe with more pages), or a newer one.
  if (cached && cachedRevision !== pageRevision(previous) && cachedRevision !== revision) return;
  const latest = cached && cachedRevision === revision ? cached : orderedAlbumList(libraryEntriesRef.current, null, page);
  libraryListCacheRef.current.set(source, category, latest);
  if (ownsList() && pageRevision(extensionPageRef.current) !== revision &&
      (reopening || stateRef.current.screen.type === 'Library')) {
    libraryLoadGenerationRef.current++;
    showLibraryList(deps, key, latest);
  }
};

// Back to a Rating list: reload from cache, or check the shown rows when the cache was cleared.
const returnToRatingAlbums = (deps: LibraryBrowserDependencies, api: RemoteApi) => {
  const { extensionPageRef, libraryListCacheRef, librarySortingRef } = deps.shared;
  if (librarySortingRef.current?.albums.effective !== 8) return;
  if (libraryListCacheRef.current.get(librarySource(deps), LibraryCategory.Albums)) void loadLibraryCategory(deps, LibraryCategory.Albums);
  else void revalidateRatingAlbums(deps, api, true, extensionPageRef.current);
};

const showCategoryLoading = (deps: LibraryBrowserDependencies, cached: LibraryList | undefined, keepShown: boolean, query: string | null) => {
  const { setState } = deps.shared;
  setState((prev) => ({
    ...prev,
    ...(cached
      ? {
          libraryEntries: cached.entries,
          libraryCountLabel: cached.label,
          libraryHasMore: cached.hasMore,
          libraryStatus: cached.entries.length > 0 ? ContentStatus.Ready : ContentStatus.Empty,
        }
      : {
          libraryEntries: keepShown ? prev.libraryEntries : [],
          libraryCountLabel: keepShown ? prev.libraryCountLabel : null,
          libraryHasMore: false,
          libraryStatus: ContentStatus.Loading,
        }),
    libraryIsNested: false,
    libraryNestedTitle: null,
    libraryQuery: query ?? '',
    connectionMessage: null,
    activePlaylist: null,
    playlistRevision: null,
    folderPath: '',
  }));
};

const loadLibraryCategory = async (
  deps: LibraryBrowserDependencies,
  cat: LibraryCategory,
  activeApi?: RemoteApi,
  query?: string | null,
  refresh: boolean = false
): Promise<void> => {
  const {
    activeCatalogRef, activePlaylistRef, apiRef, currentLibraryCategoryRef, extensionPageRef,
    libraryBrowseCatalogRef, libraryContextRef, libraryEntriesRef, libraryListCacheRef,
    libraryLoadGenerationRef, libraryPageRef, searchReads, setState, shownLibraryListRef, stateRef,
  } = deps.shared;
  const { recoverCatalogBrowse } = deps;
  const loadGeneration = ++libraryLoadGenerationRef.current;
  if (refresh || cat !== LibraryCategory.Search) searchReads.reset(!refresh);
  else searchReads.cancelSongs();
  const api = activeApi || apiRef.current;
  currentLibraryCategoryRef.current = cat;
  libraryContextRef.current = null;
  libraryPageRef.current = null;
  extensionPageRef.current = null;
  activePlaylistRef.current = null;

  const source = librarySource(deps);
  const key = libraryListKey(source, cat);
  const cached = refresh ? undefined : libraryListCacheRef.current.get(source, cat);
  libraryBrowseCatalogRef.current = needsRevalidation(cat) || cached?.extensionPage ? null : activeCatalogRef.current;
  const keepShown = shownLibraryListRef.current === key;
  const shown = cached?.entries ?? (keepShown ? stateRef.current.libraryEntries : []);
  if (!cached && !keepShown) shownLibraryListRef.current = null;

  showCategoryLoading(deps, cached, keepShown, query ?? null);
  if (cached) {
    extensionPageRef.current = cached.extensionPage;
    shownLibraryListRef.current = key;
    if (api && cat === LibraryCategory.Albums) void revalidateRatingAlbums(deps, api, true);
    if (!needsRevalidation(cat)) return;
  }

  if (!api) return;

  const context = libraryLoadContext(deps, api, activeCatalogRef.current, cat === LibraryCategory.Search);
  try {
    const loaded = await loadCategoryList(cat, query ?? null, context);
    if (loadGeneration !== libraryLoadGenerationRef.current || api !== apiRef.current) return;
    if (librarySource(deps) !== source) {
      await loadLibraryCategory(deps, cat, activeApi, query, refresh);
      return;
    }
    const entries = reconcileEntries(shown, loaded.entries, (fresh, kept) => libraryEntriesRef.current.copyTarget(fresh, kept));
    const list = entries === loaded.entries ? loaded : { ...loaded, entries };
    libraryListCacheRef.current.set(source, cat, list);
    const unchanged = cached && entries === cached.entries && list.label === cached.label && list.hasMore === cached.hasMore;
    if (!unchanged) showLibraryList(deps, key, list);
  } catch (err: any) {
    if (loadGeneration !== libraryLoadGenerationRef.current || api !== apiRef.current) return;
    if ((cat === LibraryCategory.Search && librarySource(deps) !== source) || recoverCatalogBrowse(err, context.catalog)) {
      await loadLibraryCategory(deps, cat, api, query, refresh);
      return;
    }
    setState((prev) => ({ ...prev, libraryStatus: ContentStatus.Error, connectionMessage: err?.message || 'Could not load library' }));
  }
};

const stopSearchReads = (deps: LibraryBrowserDependencies, keepVerified = true) => {
  const {
    currentLibraryCategoryRef, libraryLoadGenerationRef, searchDebounceRef, searchReads, stateRef,
  } = deps.shared;
  clearTimeout(searchDebounceRef.current?.timer);
  searchDebounceRef.current = null;
  searchReads.reset(keepVerified);
  if (currentLibraryCategoryRef.current === LibraryCategory.Search && !stateRef.current.libraryIsNested) {
    libraryLoadGenerationRef.current++;
  }
};

export function createLibraryLists(deps: LibraryBrowserDependencies) {
  return {
    libraryRow: libraryRow.bind(undefined, deps),
    libraryTarget: libraryTarget.bind(undefined, deps),
    librarySource: librarySource.bind(undefined, deps),
    libraryLoadContext: libraryLoadContext.bind(undefined, deps),
    showLibraryList: showLibraryList.bind(undefined, deps),
    revalidateRatingAlbums: revalidateRatingAlbums.bind(undefined, deps),
    returnToRatingAlbums: returnToRatingAlbums.bind(undefined, deps),
    loadLibraryCategory: loadLibraryCategory.bind(undefined, deps),
    stopSearchReads: stopSearchReads.bind(undefined, deps),
  };
}
