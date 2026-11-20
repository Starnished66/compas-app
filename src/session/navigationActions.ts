import type { useQueuePages } from './useQueuePages';
import type { createLibraryLists } from './libraryLists';
import type { SessionState } from './useSessionRefs';
import { type ActionOf } from './remoteActionDispatch';
import { PREF_THEME, THEME_PREFERENCES } from './sessionPreferences';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RemoteScreen, ContentStatus, LibraryCategory } from '../data/types';

interface NavigationActionsDependencies extends
  Pick<ReturnType<typeof createLibraryLists>, 'loadLibraryCategory'>,
  Pick<ReturnType<typeof useQueuePages>, 'refreshQueue'> {
  shared: Pick<SessionState,
    'libraryBackStackRef' | 'libraryLoadGenerationRef' | 'libraryPageLoadingRef' | 'screenBackStackRef'
    | 'searchDebounceRef' | 'setState' | 'stateRef' | 'transferSearchQueryRef'
  >;
  navigateBack: () => void;
  stopSearchReads: (keepVerified?: boolean) => void;
}

const handleSetTheme = (deps: NavigationActionsDependencies, action: ActionOf<'SetTheme'>) => {
  const { setState } = deps.shared;
  AsyncStorage.setItem(PREF_THEME, THEME_PREFERENCES[action.theme]).catch(() => {});
  setState((prev) => ({ ...prev, theme: action.theme }));
};

const handleOpenHome = (deps: NavigationActionsDependencies) => {
  const { libraryBackStackRef, screenBackStackRef, setState, stateRef } = deps.shared;
  const { stopSearchReads } = deps;
  stopSearchReads();
  if (stateRef.current.screen.type !== 'Home') {
    screenBackStackRef.current = [];
    libraryBackStackRef.current = [];
    setState((prev) => ({ ...prev, screen: { type: 'Home' }, libraryIsNested: false }));
  }
};

const handleOpenTransfer = (deps: NavigationActionsDependencies) => {
  const {
    libraryLoadGenerationRef, libraryPageLoadingRef, screenBackStackRef, searchDebounceRef, setState,
    stateRef, transferSearchQueryRef,
  } = deps.shared;
  const { stopSearchReads } = deps;
  const { screen, libraryQuery, libraryStatus } = stateRef.current;
  if (screen.type === 'Transfer') return;
  transferSearchQueryRef.current = '';
  if (screen.type === 'Library' && screen.category === LibraryCategory.Search) {
    const debounced = searchDebounceRef.current?.query;
    // Let pagination finish so Back keeps the pages already loaded.
    if (debounced || libraryPageLoadingRef.current !== libraryLoadGenerationRef.current) {
      transferSearchQueryRef.current = debounced ?? (libraryStatus === ContentStatus.Loading ? libraryQuery : '');
      stopSearchReads();
    }
  }
  screenBackStackRef.current.push(screen);
  setState((prev) => ({ ...prev, screen: { type: 'Transfer' } }));
};

const handleOpenConnection = (deps: NavigationActionsDependencies) => {
  const { screenBackStackRef, setState, stateRef } = deps.shared;
  if (stateRef.current.screen.type !== 'Connection') {
    screenBackStackRef.current.push(stateRef.current.screen);
    setState((prev) => ({ ...prev, screen: { type: 'Connection' } }));
  }
};

const handleOpenLibrary = (deps: NavigationActionsDependencies, action: ActionOf<'OpenLibrary'>) => {
  const { libraryBackStackRef, screenBackStackRef, setState, stateRef } = deps.shared;
  const { loadLibraryCategory, stopSearchReads } = deps;
  const cat = action.category;
  stopSearchReads();
  const targetScreen: RemoteScreen = { type: 'Library', category: cat };
  if (stateRef.current.screen.type !== 'Library' || stateRef.current.screen.category !== cat) {
    screenBackStackRef.current.push(stateRef.current.screen);
  }
  libraryBackStackRef.current = [];
  setState((prev) => ({ ...prev, screen: targetScreen, libraryIsNested: false }));
  loadLibraryCategory(cat);
};

const handleOpenQueue = (deps: NavigationActionsDependencies) => {
  const { screenBackStackRef, setState, stateRef } = deps.shared;
  const { refreshQueue } = deps;
  if (stateRef.current.screen.type !== 'Queue') {
    screenBackStackRef.current.push(stateRef.current.screen);
    setState((prev) => ({ ...prev, screen: { type: 'Queue' } }));
    refreshQueue();
  }
};

const handleBack = (deps: NavigationActionsDependencies) => {
  const { navigateBack } = deps;
  navigateBack();
};

export function createNavigationActions(deps: NavigationActionsDependencies) {
  const navigationActions = {
    SetTheme: handleSetTheme.bind(undefined, deps),
    OpenHome: handleOpenHome.bind(undefined, deps),
    OpenTransfer: handleOpenTransfer.bind(undefined, deps),
    OpenConnection: handleOpenConnection.bind(undefined, deps),
    OpenLibrary: handleOpenLibrary.bind(undefined, deps),
    OpenQueue: handleOpenQueue.bind(undefined, deps),
    Back: handleBack.bind(undefined, deps),
  };
  return { navigationActions };
}
