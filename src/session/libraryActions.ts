import type { createLibraryLists } from './libraryLists';
import type { createLibrarySortingSession } from './librarySortingSession';
import type { SessionState } from './useSessionRefs';
import { type ActionOf } from './remoteActionDispatch';
import { ContentStatus, LibraryCategory } from '../data/types';
import { RemoteApi } from '../data/RemoteApi';
import { CatalogIdentity } from '../data/SyncedCatalogStore';
import { libraryListKey } from './LibraryListCache';

interface LibraryActionsDependencies extends
  Pick<ReturnType<typeof createLibraryLists>, 'loadLibraryCategory'>,
  Pick<ReturnType<typeof createLibrarySortingSession>, 'setLibrarySorting'> {
  shared: Pick<SessionState,
    'apiRef' | 'connectionAttemptRef' | 'currentLibraryCategoryRef' | 'featureSetRef'
    | 'libraryLoadGenerationRef' | 'searchDebounceRef' | 'searchReads'
    | 'setState' | 'shownLibraryListRef' | 'stateRef'
  >;
  searchReturnCategoryRef: React.RefObject<LibraryCategory>;
  librarySource: (catalog?: CatalogIdentity | null) => string;
  loadLibraryArtwork: (id: string) => Promise<void>;
  loadMoreLibrary: () => Promise<void>;
  playNativeCollection: (shuffle: boolean) => Promise<void>;
  selectLibraryEntry: (id: string) => Promise<void>;
  startCatalogSync: (api: RemoteApi, attempt: number, features: string[], refreshCoversManifest?: boolean) => Promise<void>;
  stopSearchReads: (keepVerified?: boolean) => void;
}

const handleRefreshLibrary = (deps: LibraryActionsDependencies, action: ActionOf<'RefreshLibrary'>) => {
  const { loadLibraryCategory } = deps;
  loadLibraryCategory(action.category, undefined, null, true);
};

const handleSyncLibrary = (deps: LibraryActionsDependencies) => {
  const { apiRef, connectionAttemptRef, featureSetRef } = deps.shared;
  const { startCatalogSync } = deps;
  const api = apiRef.current;
  if (api) startCatalogSync(api, connectionAttemptRef.current, [...featureSetRef.current]);
};

const handleSetLibrarySorting = (deps: LibraryActionsDependencies, action: ActionOf<'SetLibrarySorting'>) => {
  const { setLibrarySorting } = deps;
  void setLibrarySorting(action.scope, action.mode);
};

const handlePlayCollection = (deps: LibraryActionsDependencies, action: ActionOf<'PlayCollection'>) => {
  const { playNativeCollection } = deps;
  void playNativeCollection(action.shuffle);
};

const handleSearchLibrary = (deps: LibraryActionsDependencies, action: ActionOf<'SearchLibrary'>) => {
  const {
    currentLibraryCategoryRef, libraryLoadGenerationRef, searchDebounceRef, searchReads, setState,
    shownLibraryListRef, stateRef,
  } = deps.shared;
  const { librarySource, loadLibraryCategory, searchReturnCategoryRef, stopSearchReads } = deps;
  const term = action.query.trim();
  const currentCategory = currentLibraryCategoryRef.current;
  if (term) {
    clearTimeout(searchDebounceRef.current?.timer);
    searchReads.cancelSongs();
    if (currentCategory === LibraryCategory.Search) libraryLoadGenerationRef.current++;
  } else stopSearchReads();
  if (term && currentCategory !== LibraryCategory.Search) {
    searchReturnCategoryRef.current = currentCategory;
  }
  const targetCategory = term ? LibraryCategory.Search
    : currentCategory === LibraryCategory.Search ? searchReturnCategoryRef.current : currentCategory;
  const screen = stateRef.current.screen;
  const enteringSearch = targetCategory === LibraryCategory.Search &&
    !(screen.type === 'Library' && screen.category === LibraryCategory.Search);
  if (enteringSearch) shownLibraryListRef.current = null;
  if (screen.type !== 'Library' || screen.category !== targetCategory) {
    setState((prev) => ({
      ...prev,
      screen: { type: 'Library', category: targetCategory },
      ...(enteringSearch ? { libraryEntries: [], libraryStatus: ContentStatus.Loading } : {}),
    }));
  }
  if (term) {
    const timer = setTimeout(() => {
      searchDebounceRef.current = null;
      loadLibraryCategory(targetCategory, undefined, term);
    }, 300);
    searchDebounceRef.current = { timer, query: term };
  } else if (shownLibraryListRef.current !== libraryListKey(librarySource(), targetCategory)) {
    loadLibraryCategory(targetCategory);
  }
};

const handleSelectLibraryEntry = (deps: LibraryActionsDependencies, action: ActionOf<'SelectLibraryEntry'>) => {
  const { selectLibraryEntry } = deps;
  selectLibraryEntry(action.id);
};

const handleLoadLibraryArtwork = (deps: LibraryActionsDependencies, action: ActionOf<'LoadLibraryArtwork'>) => {
  const { loadLibraryArtwork } = deps;
  loadLibraryArtwork(action.entryId);
};

export function createLibraryActions(deps: LibraryActionsDependencies) {
  return {
    libraryActions: {
      RefreshLibrary: handleRefreshLibrary.bind(undefined, deps),
      SyncLibrary: handleSyncLibrary.bind(undefined, deps),
      SetLibrarySorting: handleSetLibrarySorting.bind(undefined, deps),
      PlayCollection: handlePlayCollection.bind(undefined, deps),
      SearchLibrary: handleSearchLibrary.bind(undefined, deps),
      SelectLibraryEntry: handleSelectLibraryEntry.bind(undefined, deps),
      LoadLibraryArtwork: handleLoadLibraryArtwork.bind(undefined, deps),
      LoadMoreLibrary: deps.loadMoreLibrary,
    },
  };
}
