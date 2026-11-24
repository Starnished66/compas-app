import type { useQueuePages } from './useQueuePages';
import type { createLibraryLists } from './libraryLists';
import type { SessionState } from './useSessionRefs';
import { type ActionOf } from './remoteActionDispatch';
import { PREF_THEME, THEME_PREFERENCES } from './sessionPreferences';
import { loadSavedProfiles } from '../data/SavedProfilesStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RemoteScreen, ContentStatus, LibraryCategory, LibraryGroup } from '../data/types';
import type { AlbumLookupTarget } from './catalogJump';
import type { AlbumJumpLookup } from './libraryCollections';
import type { LibraryContext } from './LibraryEntryFactory';

interface NavigationActionsDependencies extends
  Pick<ReturnType<typeof createLibraryLists>, 'loadLibraryCategory'>,
  Pick<ReturnType<typeof useQueuePages>, 'refreshQueue'> {
  shared: Pick<SessionState,
    'apiRef' | 'connectionAttemptRef' | 'libraryBackStackRef' | 'libraryLoadGenerationRef' | 'libraryPageLoadingRef'
    | 'screenBackStackRef' | 'searchDebounceRef' | 'setState' | 'stateRef' | 'transferSearchQueryRef'
  >;
  navigateBack: () => void;
  stopSearchReads: (keepVerified?: boolean) => void;
  beginCatalogJump: (category: LibraryCategory, album?: LibraryGroup) => void;
  findAlbumForJump: (target: AlbumLookupTarget) => Promise<AlbumJumpLookup>;
  openAlbumGroup: (group: LibraryGroup) => Promise<void>;
  loadGroupAlbums: (context: LibraryContext) => Promise<void>;
}

type JumpSequence = { current: number };

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
    void loadSavedProfiles().then((savedProfiles) => setState((prev) => ({ ...prev, savedProfiles })));
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

/** Go to Album looks the album up first; any later navigation, jump or Library load drops a stale lookup. */
const handleGoToAlbum = async (deps: NavigationActionsDependencies, jumps: JumpSequence, action: ActionOf<'GoToAlbum'>) => {
  const { apiRef, connectionAttemptRef, libraryLoadGenerationRef, setState, stateRef } = deps.shared;
  const album = action.album.trim();
  const api = apiRef.current;
  if (!album || !api) return;
  const sequence = ++jumps.current;
  const attempt = connectionAttemptRef.current;
  const screen = stateRef.current.screen;
  const generation = libraryLoadGenerationRef.current;
  const found = await deps.findAlbumForJump({
    album, title: action.title, artist: action.artist, albumArtist: action.albumArtist,
    albumKey: action.albumKey, songId: action.songId,
  });
  if (sequence !== jumps.current || api !== apiRef.current || attempt !== connectionAttemptRef.current ||
      screen !== stateRef.current.screen || generation !== libraryLoadGenerationRef.current) return;
  if ('error' in found) {
    setState((prev) => ({ ...prev, connectionMessage: found.error }));
    return;
  }
  deps.beginCatalogJump(LibraryCategory.Albums, found.group);
  await deps.openAlbumGroup(found.group);
};

const handleGoToArtist = async (deps: NavigationActionsDependencies, jumps: JumpSequence, action: ActionOf<'GoToArtist'>) => {
  const artist = action.artist.trim();
  if (!artist || !deps.shared.apiRef.current) return;
  jumps.current++;
  deps.beginCatalogJump(LibraryCategory.Artists);
  await deps.loadGroupAlbums({ kind: 'artist', name: artist });
};

export function createNavigationActions(deps: NavigationActionsDependencies) {
  const jumps: JumpSequence = { current: 0 };
  // Every navigation counts as newer than a pending album lookup, including a round trip back to the same screen.
  const navigation = <A extends unknown[]>(handler: (...args: A) => void) => (...args: A) => {
    jumps.current++;
    handler(...args);
  };
  const navigationActions = {
    SetTheme: handleSetTheme.bind(undefined, deps),
    OpenHome: navigation(handleOpenHome.bind(undefined, deps)),
    OpenTransfer: navigation(handleOpenTransfer.bind(undefined, deps)),
    OpenConnection: navigation(handleOpenConnection.bind(undefined, deps)),
    OpenLibrary: navigation((action: ActionOf<'OpenLibrary'>) => handleOpenLibrary(deps, action)),
    OpenQueue: navigation(handleOpenQueue.bind(undefined, deps)),
    GoToAlbum: (action: ActionOf<'GoToAlbum'>) => { void handleGoToAlbum(deps, jumps, action); },
    GoToArtist: (action: ActionOf<'GoToArtist'>) => { void handleGoToArtist(deps, jumps, action); },
    Back: navigation(handleBack.bind(undefined, deps)),
  };
  return { navigationActions };
}
