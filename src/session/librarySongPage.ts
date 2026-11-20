import type { createLibraryLists } from './libraryLists';
import type { SessionState } from './useSessionRefs';
import { ContentStatus, Song, PlayContext, LibraryFilter } from '../data/types';
import { RemoteApi } from '../data/RemoteApi';
import { CatalogIdentity } from '../data/SyncedCatalogStore';
import { LibraryContext, NetworkSongSource } from './LibraryEntryFactory';
import { AlbumBrowseIdentity, exactAlbumBrowseKey } from './albumBrowseIdentity';
import { LIBRARY_PAGE_SIZE, readNetworkSongPage, songFromCatalog, supportsSplitGenres } from './libraryCategoryLoader';
import { CommandOutcome } from './PlaybackStatusGate';
import type { TranslationVariables } from '../i18n/translate';

interface LibrarySongPageDependencies extends
  Pick<ReturnType<typeof createLibraryLists>, 'loadLibraryCategory'> {
  shared: Pick<SessionState,
    'activeCatalogRef' | 'apiRef' | 'connectionAttemptRef' | 'currentLibraryCategoryRef'
    | 'featureSetRef' | 'gateRef' | 'libraryBrowseCatalogRef' | 'libraryContextRef'
    | 'libraryEntriesRef' | 'libraryLoadGenerationRef' | 'libraryPageLoadingRef' | 'libraryPageRef'
    | 'setState' | 'shownLibraryListRef' | 'stateRef' | 'syncedCatalogStoreRef'
  >;
  loadGroupAlbums: (context: LibraryContext) => Promise<void>;
  recoverCatalogBrowse: (error: unknown, catalog: CatalogIdentity | null) => boolean;
  t: (source: string, variables?: TranslationVariables | undefined) => string;
}

const showSongPageLoading = (deps: LibrarySongPageDependencies, append: boolean) => {
  const { setState } = deps.shared;
  if (append) {
    setState((prev) => ({ ...prev, libraryStatus: ContentStatus.Loading }));
  } else {
    setState((prev) => ({
      ...prev,
      libraryEntries: [],
      libraryStatus: ContentStatus.Loading,
      libraryCountLabel: null,
      libraryHasMore: false,
    }));
  }
};

const publishSongPage = (
  deps: LibrarySongPageDependencies,
  factory: SessionState['libraryEntriesRef']['current'], songs: Song[], playContext: PlayContext,
  source: string | null | NetworkSongSource, append: boolean, total: number,
) => {
  const { libraryEntriesRef, setState, stateRef } = deps.shared;
  const entries = factory.songs(
    songs,
    playContext,
    source,
    append ? stateRef.current.libraryEntries : []
  );
  const nextEntries = append ? libraryEntriesRef.current.append(stateRef.current.libraryEntries, entries) : entries;

  setState((prev) => ({
    ...prev,
    libraryEntries: nextEntries,
    libraryHasMore: nextEntries.length < total,
    libraryStatus: nextEntries.length > 0 ? ContentStatus.Ready : ContentStatus.Empty,
    libraryCountLabel:
      total > nextEntries.length
        ? `Showing ${nextEntries.length} of ${total} tracks`
        : `${nextEntries.length} tracks`,
  }));
};

const readLocalSongPage = (
  deps: LibrarySongPageDependencies, catalog: CatalogIdentity, offset: number,
  filter: LibraryFilter, exactAlbumKey: string | null,
) => {
  return deps.shared.syncedCatalogStoreRef.current.songPage(
    catalog.libraryId,
    catalog.revision,
    offset,
    LIBRARY_PAGE_SIZE,
    null,
    filter.artist ?? null,
    filter.albumArtist ?? null,
    filter.album ?? null,
    filter.genre ?? null,
    exactAlbumKey,
    supportsSplitGenres(deps.shared.featureSetRef.current),
  );
};

function showSongPageError({ shared }: LibrarySongPageDependencies, message: string) {
  shared.setState((prev) => ({ ...prev, libraryStatus: ContentStatus.Error, libraryCountLabel: message }));
}

const startSongPage = async (
  deps: LibrarySongPageDependencies,
  filter: LibraryFilter,
  playContext: PlayContext,
  albumKey: string | null = null,
  append: boolean = false,
  albumIdentity?: AlbumBrowseIdentity
) => {
  const {
    activeCatalogRef, apiRef, connectionAttemptRef, featureSetRef, libraryBrowseCatalogRef,
    libraryEntriesRef, libraryLoadGenerationRef, libraryPageLoadingRef, libraryPageRef,
    stateRef, syncedCatalogStoreRef,
  } = deps.shared;
  const { recoverCatalogBrowse, t } = deps;
  const factory = libraryEntriesRef.current;
  if (append && libraryPageLoadingRef.current === libraryLoadGenerationRef.current) return;
  if (!append) libraryPageRef.current = { filter, playContext, albumKey, albumIdentity };
  if (!append) ++libraryLoadGenerationRef.current;
  const generation = libraryLoadGenerationRef.current;
  const attempt = connectionAttemptRef.current;
  libraryPageLoadingRef.current = generation;
  const api = apiRef.current;
  const catalog = !append || libraryBrowseCatalogRef.current ? activeCatalogRef.current : null;
  if (!append) libraryBrowseCatalogRef.current = catalog;
  const currentOffset = append ? stateRef.current.libraryEntries.length : 0;

  showSongPageLoading(deps, append);
  try {
    let songs: Song[] = [];
    let total = 0;
    let source: string | null | NetworkSongSource = catalog?.revision ?? null;
    const exactAlbumKey = featureSetRef.current.has('collection_playback')
      ? await exactAlbumBrowseKey(albumIdentity, filter.artist, albumKey, !!catalog,
        (id) => catalog
          ? syncedCatalogStoreRef.current.albumKeyForSong(catalog.libraryId, catalog.revision, id)
          : Promise.resolve(null), t)
      : albumKey;
    if (api !== apiRef.current || attempt !== connectionAttemptRef.current || generation !== libraryLoadGenerationRef.current) return;

    if (catalog) {
      const res = await readLocalSongPage(deps, catalog, currentOffset, filter, exactAlbumKey);
      songs = res.songs.map(songFromCatalog);
      total = res.total;
    } else if (api) {
      const res = await readNetworkSongPage(api, () => api.library(currentOffset, LIBRARY_PAGE_SIZE, null, filter));
      source = res;
      songs = res.songs;
      total = res.total;
    }

    if (api !== apiRef.current || attempt !== connectionAttemptRef.current || generation !== libraryLoadGenerationRef.current) return;
    publishSongPage(deps, factory, songs, playContext, source, append, total);
  } catch (err: any) {
    if (api !== apiRef.current || attempt !== connectionAttemptRef.current || generation !== libraryLoadGenerationRef.current) return;
    if (recoverCatalogBrowse(err, catalog)) return startSongPage(deps, filter, playContext, albumKey, false, albumIdentity);
    showSongPageError(deps, err?.message || 'Failed to load tracks');
  } finally {
    if (libraryPageLoadingRef.current === generation) libraryPageLoadingRef.current = null;
  }
};

const playLibrarySong = async (
  deps: LibrarySongPageDependencies,
  index: number,
  context: PlayContext = {},
  catalogRevision?: string | null
) => {
  const { apiRef, gateRef, setState } = deps.shared;
  const api = apiRef.current;
  if (!api) return;

  const token = gateRef.current.beginExplicitAction(true);
  api.preemptArtworkRequest();

  setState((prev) => ({
    ...prev,
    isPlaying: true,
    connectionMessage: null,
  }));

  try {
    await api.play(index, context, catalogRevision);
    // Always settle the token: a reset gate ignores it, a live one would stay blocked forever.
    gateRef.current.finishAction(token, CommandOutcome.Succeeded, Date.now());
  } catch (err: any) {
    const is4xx = err?.statusCode >= 400 && err?.statusCode < 500;
    gateRef.current.finishAction(
      token,
      is4xx ? CommandOutcome.Failed : CommandOutcome.Uncertain,
      Date.now()
    );
    setState((prev) => ({
      ...prev,
      connectionMessage: err?.message || 'Playback failed',
    }));
  }
};

const restartCatalogBrowse = (deps: LibrarySongPageDependencies, api: RemoteApi, isNested: boolean, query: string) => {
  const {
    currentLibraryCategoryRef, libraryContextRef, libraryLoadGenerationRef, libraryPageLoadingRef,
    libraryPageRef, shownLibraryListRef,
  } = deps.shared;
  const { loadGroupAlbums, loadLibraryCategory } = deps;
  const page = isNested ? libraryPageRef.current : null;
  const context = isNested ? libraryContextRef.current : null;
  shownLibraryListRef.current = null;
  const loading = page ? startSongPage(deps, page.filter, page.playContext, page.albumKey, false, page.albumIdentity)
    : context ? loadGroupAlbums(context)
    : loadLibraryCategory(currentLibraryCategoryRef.current, api, query || null, true);
  const generation = libraryLoadGenerationRef.current;
  libraryPageLoadingRef.current = generation;
  void loading.finally(() => {
    if (libraryPageLoadingRef.current === generation) libraryPageLoadingRef.current = null;
  });
};

export function createLibrarySongPage(deps: LibrarySongPageDependencies) {
  return {
    startSongPage: startSongPage.bind(undefined, deps),
    playLibrarySong: playLibrarySong.bind(undefined, deps),
    restartCatalogBrowse: restartCatalogBrowse.bind(undefined, deps),
  };
}
