import type { createLibraryLists } from './libraryLists';
import type { ExtensionPage } from './LibraryListCache';
import type { SessionState } from './useSessionRefs';
import { sameCatalogRevision } from './librarySnapshot';
import { ContentStatus, LibraryCategory, LibraryEntry, Playlist } from '../data/types';
import { RemoteApi } from '../data/RemoteApi';
import { CatalogIdentity } from '../data/SyncedCatalogStore';
import { LibraryList, libraryListKey } from './LibraryListCache';
import { loadSongsAfter, readNetworkSongPage } from './libraryCategoryLoader';
import { orderedAlbumList, readMoreOrderedAlbums } from './orderedAlbumPaging';
import type { CategoryLoadContext } from './libraryCategoryLoader';
import type { LibraryFilter, PlayContext } from '../data/types';
import type { AlbumBrowseIdentity } from './albumBrowseIdentity';

interface LibraryPagingDependencies extends
  Pick<ReturnType<typeof createLibraryLists>, 'loadLibraryCategory'> {
  shared: Pick<SessionState,
    'activeCatalogRef' | 'activePlaylistRef' | 'apiRef' | 'currentLibraryCategoryRef'
    | 'extensionPageRef' | 'libraryBrowseCatalogRef' | 'libraryEntriesRef' | 'libraryListCacheRef'
    | 'libraryLoadGenerationRef' | 'libraryPageLoadingRef' | 'libraryPageRef' | 'searchDebounceRef'
    | 'setState' | 'shownLibraryListRef' | 'stateRef'
  >;
  browsePlaylist: (playlist: Playlist) => Promise<void>;
  libraryLoadContext: (api: RemoteApi, catalog?: CatalogIdentity | null, search?: boolean) => CategoryLoadContext;
  librarySource: (catalog?: CatalogIdentity | null) => string;
  recoverCatalogBrowse: (error: unknown, catalog: CatalogIdentity | null) => boolean;
  restartCatalogBrowse: (api: RemoteApi, isNested: boolean, query: string) => void;
  showLibraryList: (key: string | null, list: LibraryList) => void;
  startSongPage: (filter: LibraryFilter, playContext: PlayContext, albumKey?: string | null, append?: boolean, albumIdentity?: AlbumBrowseIdentity | undefined) => Promise<void>;
}

const publishOrderedAlbums = (
  deps: LibraryPagingDependencies,
  cursor: Extract<ExtensionPage, { kind: 'orderedAlbums' }>,
  page: NonNullable<Awaited<ReturnType<typeof readMoreOrderedAlbums>>>,
  source: string, factory: SessionState['libraryEntriesRef']['current'],
) => {
  const { libraryListCacheRef, stateRef } = deps.shared;
  const { showLibraryList } = deps;
  const { context } = cursor;
  const key = context ? null : libraryListKey(source, LibraryCategory.Albums);
  const shown = page.offset === 0 ? [] : stateRef.current.libraryEntries;
  const list = orderedAlbumList(factory, context, page, shown);
  if (key) libraryListCacheRef.current.set(source, LibraryCategory.Albums, list);
  showLibraryList(key, list);
};

const appendExtensionRows = (
  { shared: { extensionPageRef, libraryEntriesRef, setState } }: LibraryPagingDependencies,
  cursor: ExtensionPage, entries: LibraryEntry[], nextOffset: number, total: number,
) => {
  extensionPageRef.current = { ...cursor, nextOffset, total };
  setState((prev) => ({
    ...prev,
    libraryEntries: libraryEntriesRef.current.append(prev.libraryEntries, entries),
    libraryHasMore: nextOffset > cursor.nextOffset && nextOffset < total,
    libraryStatus: ContentStatus.Ready,
  }));
};

const loadMoreExtension = async (
  deps: LibraryPagingDependencies,
  api: RemoteApi, cursor: ExtensionPage, generation: number, factory: SessionState['libraryEntriesRef']['current'],
) => {
  const {
    activePlaylistRef, apiRef, extensionPageRef, libraryLoadGenerationRef, libraryPageLoadingRef,
    setState, stateRef,
  } = deps.shared;
  const { browsePlaylist, librarySource, loadLibraryCategory } = deps;
  const screen = stateRef.current.screen;
  const source = librarySource();
  const samePage = () => api === apiRef.current && cursor === extensionPageRef.current && generation === libraryLoadGenerationRef.current;
  const ownsView = () => samePage() && screen.type === 'Library' && screen === stateRef.current.screen && source === librarySource();
  if (cursor.kind === 'orderedAlbums' && !ownsView()) return;
  libraryPageLoadingRef.current = generation;
  setState((prev) => ({ ...prev, libraryStatus: ContentStatus.Loading }));
  try {
    if (cursor.kind === 'orderedAlbums') {
      const page = await readMoreOrderedAlbums(api, cursor, ownsView);
      if (!page || !ownsView()) return;
      publishOrderedAlbums(deps, cursor, page, source, factory);
      return;
    }
    let entries: LibraryEntry[] = [];
    let nextOffset = cursor.nextOffset;
    let total = cursor.total;
    if (cursor.kind === 'folder') {
      const page = await api.folder(cursor.path || '', cursor.nextOffset, cursor.root || 'sd');
      if (!samePage()) return;
      entries = factory.folderItems(
        page.entries,
        cursor.root || 'sd',
        cursor.path || '',
        stateRef.current.libraryEntries
      );
      nextOffset = page.nextOffset;
      total = page.total;
    } else if (cursor.kind === 'recent') {
      const page = await readNetworkSongPage(api, () => api.recent(cursor.nextOffset));
      entries = factory.songs(page.songs, { playlist: '@recently_played' }, page, stateRef.current.libraryEntries);
      nextOffset = page.nextOffset;
      total = page.total;
    } else if (cursor.key) {
      const key = cursor.key;
      const page = await readNetworkSongPage(api, () => api.playlistPage(key, cursor.nextOffset));
      if (!samePage()) return;
      if (stateRef.current.playlistRevision && page.revision && page.revision !== stateRef.current.playlistRevision) {
        if (activePlaylistRef.current) await browsePlaylist(activePlaylistRef.current);
        else await loadLibraryCategory(LibraryCategory.Favorites, api);
        return;
      }
      entries = factory.songs(page.songs, { playlist: key }, page, stateRef.current.libraryEntries);
      nextOffset = page.nextOffset;
      total = page.total;
    }
    if (!samePage()) return;
    appendExtensionRows(deps, cursor, entries, nextOffset, total);
  } catch (err: any) {
    if (!samePage() || (cursor.kind === 'orderedAlbums' && !ownsView())) return;
    setState((prev) => ({ ...prev, libraryStatus: ContentStatus.Error, connectionMessage: err?.message || 'Could not load more items' }));
  } finally {
    if (libraryPageLoadingRef.current === generation) libraryPageLoadingRef.current = null;
    if (cursor.kind === 'orderedAlbums' && samePage() && !ownsView()) {
      setState((prev) => (prev.screen.type !== 'Library' || prev.screen === screen) && prev.libraryStatus === ContentStatus.Loading
        ? { ...prev, libraryStatus: ContentStatus.Ready } : prev);
    }
  }
};

const loadMoreCategorySongs = async (deps: LibraryPagingDependencies, api: RemoteApi, generation: number, browseCatalog: CatalogIdentity | null) => {
  const {
    activeCatalogRef, apiRef, currentLibraryCategoryRef, libraryEntriesRef, libraryListCacheRef,
    libraryLoadGenerationRef, libraryPageLoadingRef, searchDebounceRef, setState, shownLibraryListRef,
    stateRef,
  } = deps.shared;
  const { libraryLoadContext, librarySource, loadLibraryCategory, recoverCatalogBrowse } = deps;
  const isSearch = currentLibraryCategoryRef.current === LibraryCategory.Search;
  if (isSearch && searchDebounceRef.current !== null) return;
  libraryPageLoadingRef.current = generation;
  setState((prev) => ({ ...prev, libraryStatus: ContentStatus.Loading }));
  const shown = stateRef.current.libraryEntries;
  const offset = isSearch ? shown.filter((entry) => entry.kind === 'song').length : shown.length;
  const catalog = browseCatalog ? activeCatalogRef.current : null;
  const source = librarySource(catalog);
  const context = libraryLoadContext(api, catalog, isSearch);
  const query = stateRef.current.libraryQuery.trim() || null;
  try {
    const page = await loadSongsAfter(context, shown, offset, query);
    if (generation !== libraryLoadGenerationRef.current) return;
    const all = libraryEntriesRef.current.append(shown, page.entries);
    const list: LibraryList = {
      entries: all,
      total: page.total,
      hasMore: offset + page.entries.length < page.total,
      label: isSearch
        ? `${shown.length - offset} groups · ${page.total} tracks`
        : `Showing ${all.length} of ${page.total} tracks`,
      extensionPage: null,
    };
    if (!isSearch && source === librarySource() && shownLibraryListRef.current === libraryListKey(source, LibraryCategory.Songs)) {
      libraryListCacheRef.current.set(source, LibraryCategory.Songs, list);
    }
    setState((prev) => ({
      ...prev,
      libraryEntries: all,
      libraryHasMore: list.hasMore,
      libraryStatus: ContentStatus.Ready,
      libraryCountLabel: list.label,
    }));
  } catch (error) {
    if (generation !== libraryLoadGenerationRef.current || api !== apiRef.current) return;
    if (recoverCatalogBrowse(error, context.catalog)) {
      await loadLibraryCategory(currentLibraryCategoryRef.current, api, query);
    } else setState((prev) => ({ ...prev, libraryStatus: ContentStatus.Error }));
  } finally {
    if (libraryPageLoadingRef.current === generation) libraryPageLoadingRef.current = null;
  }
};

const loadMoreLibrary = async (deps: LibraryPagingDependencies) => {
  const {
    activeCatalogRef, apiRef, currentLibraryCategoryRef, extensionPageRef, libraryBrowseCatalogRef,
    libraryEntriesRef, libraryLoadGenerationRef, libraryPageLoadingRef, libraryPageRef, stateRef,
  } = deps.shared;
  const { restartCatalogBrowse, startSongPage } = deps;
  const api = apiRef.current;
  const factory = libraryEntriesRef.current;
  const generation = libraryLoadGenerationRef.current;
  if (!api || !stateRef.current.libraryHasMore || libraryPageLoadingRef.current === generation) return;
  const browseCatalog = libraryBrowseCatalogRef.current;
  if (browseCatalog && !sameCatalogRevision(browseCatalog, activeCatalogRef.current)) {
    const { libraryIsNested, libraryQuery } = stateRef.current;
    restartCatalogBrowse(api, libraryIsNested, libraryQuery);
    return;
  }
  if (extensionPageRef.current) {
    await loadMoreExtension(deps, api, extensionPageRef.current, generation, factory);
  } else if (stateRef.current.libraryIsNested && libraryPageRef.current) {
    const page = libraryPageRef.current;
    startSongPage(page.filter, page.playContext, page.albumKey, true, page.albumIdentity);
  } else if (currentLibraryCategoryRef.current === LibraryCategory.Songs ||
             currentLibraryCategoryRef.current === LibraryCategory.Search) {
    await loadMoreCategorySongs(deps, api, generation, browseCatalog);
  }
};

export function createLibraryPaging(deps: LibraryPagingDependencies) {
  return {
    loadMoreLibrary: loadMoreLibrary.bind(undefined, deps),
  };
}
