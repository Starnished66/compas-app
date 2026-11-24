import { useRef } from 'react';
import { LibraryCategory } from '../data/types';
import { createLibraryLists } from './libraryLists';
import { createLibraryNavigation } from './libraryNavigation';
import { createLibraryCollections } from './libraryCollections';
import { createLibrarySongPage } from './librarySongPage';
import { createLibrarySortingSession } from './librarySortingSession';
import { createLibraryPaging } from './libraryPaging';
import { createNavigationActions } from './navigationActions';
import { createLibraryActions } from './libraryActions';
import { useLazyRef } from './useLazyRef';
import type { TranslationVariables } from '../i18n/translate';
import type { createCatalogAdoption } from './catalogAdoption';
import type { createCatalogSync } from './catalogSync';
import type { useRemoteQueue } from './useRemoteQueue';
import type { useSessionArtwork } from './useSessionArtwork';
import type { SessionState } from './useSessionRefs';

type LibraryBrowserDependencies = {
  shared: SessionState;
  t: (source: string, variables?: TranslationVariables) => string;
}
  & Pick<ReturnType<typeof createCatalogAdoption>, 'recoverCatalogBrowse'>
  & Pick<ReturnType<typeof useRemoteQueue>, 'refreshQueue'>
  & Pick<ReturnType<typeof useSessionArtwork>, 'loadLibraryArtwork'>
  & ReturnType<typeof createCatalogSync>;

export function useLibraryBrowser({
  shared, t, recoverCatalogBrowse, refreshQueue, loadLibraryArtwork, startCatalogSync,
}: LibraryBrowserDependencies) {
  const searchReturnCategoryRef = useRef(LibraryCategory.Artists);
  const lists = createLibraryLists({ shared, recoverCatalogBrowse });
  const { loadLibraryCategory, stopSearchReads, showLibraryList, librarySource, libraryLoadContext, libraryTarget } = lists;
  const navigation = createLibraryNavigation({
    shared, loadLibraryCategory, stopSearchReads, returnToRatingAlbums: lists.returnToRatingAlbums,
    refreshSortedView: (...args) => sorting.refreshSortedView(...args),
    restartCatalogBrowse: (...args) => songs.restartCatalogBrowse(...args),
  });
  const collections = createLibraryCollections({
    shared, libraryLoadContext, libraryTarget, recoverCatalogBrowse, showLibraryList,
    pushLibraryState: navigation.pushLibraryState,
    playLibrarySong: (...args) => songs.playLibrarySong(...args),
    startSongPage: (...args) => songs.startSongPage(...args),
  });
  const { loadGroupAlbums, browsePlaylist, selectLibraryEntry } = collections;
  const songs = createLibrarySongPage({ shared, t, loadLibraryCategory, loadGroupAlbums, recoverCatalogBrowse });
  const sorting = createLibrarySortingSession({ shared, loadLibraryCategory, loadGroupAlbums });
  const actions = useLazyRef(() => {
    const { loadMoreLibrary } = createLibraryPaging({
      shared, browsePlaylist, libraryLoadContext, librarySource, loadLibraryCategory,
      recoverCatalogBrowse, showLibraryList,
      restartCatalogBrowse: songs.restartCatalogBrowse, startSongPage: songs.startSongPage,
    });
    return {
      ...createLibraryActions({
        shared, librarySource, loadLibraryArtwork, loadLibraryCategory, loadMoreLibrary,
        searchReturnCategoryRef, selectLibraryEntry, startCatalogSync, stopSearchReads,
        playNativeCollection: sorting.playNativeCollection, setLibrarySorting: sorting.setLibrarySorting,
      }),
      ...createNavigationActions({
        shared, loadLibraryCategory, refreshQueue, stopSearchReads, navigateBack: navigation.navigateBack,
        beginCatalogJump: navigation.beginCatalogJump, findAlbumForJump: collections.findAlbumForJump,
        openAlbumGroup: collections.openAlbumGroup, loadGroupAlbums,
      }),
    };
  }).current;

  return {
    libraryRow: lists.libraryRow,
    libraryTarget,
    loadLibraryCategory,
    revalidateRatingAlbums: lists.revalidateRatingAlbums,
    stopSearchReads,
    browsePlaylist,
    restartCatalogBrowse: songs.restartCatalogBrowse,
    refreshLibrarySorting: sorting.refreshLibrarySorting,
    ...actions,
  };
}
