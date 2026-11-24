import type { SessionState } from './useSessionRefs';
import { ContentStatus, LibraryCategory, LibraryGroup, Playlist, PlayContext, LibraryFilter } from '../data/types';
import { RemoteApi } from '../data/RemoteApi';
import { CatalogGroupKind, CatalogIdentity } from '../data/SyncedCatalogStore';
import { resolveAlbumGroup, type AlbumLookupTarget } from './catalogJump';
import { EntryTarget, LibraryContext } from './LibraryEntryFactory';
import { AlbumBrowseIdentity } from './albumBrowseIdentity';
import { LibraryList } from './LibraryListCache';
import { loadGroupAlbumRows, loadTopRatedAlbums, readNetworkSongPage, TOP_RATED_ALBUMS_ROW } from './libraryCategoryLoader';
import { isServerOrderedAlbumSort } from './librarySorting';
import { orderedAlbumList, readOrderedAlbumPage } from './orderedAlbumPaging';
import type { CategoryLoadContext } from './libraryCategoryLoader';

interface LibraryCollectionsDependencies {
  shared: Pick<SessionState,
    'activeCatalogRef' | 'activePlaylistRef' | 'apiRef' | 'connectionAttemptRef'
    | 'currentLibraryCategoryRef' | 'extensionPageRef' | 'featureSetRef' | 'libraryBrowseCatalogRef'
    | 'libraryContextRef' | 'libraryEntriesRef' | 'libraryLoadGenerationRef' | 'libraryPageRef'
    | 'librarySortingRef' | 'setState' | 'stateRef' | 'syncedCatalogStoreRef'
  >;
  libraryLoadContext: (api: RemoteApi, catalog?: CatalogIdentity | null, search?: boolean) => CategoryLoadContext;
  libraryTarget: (id: string) => EntryTarget | undefined;
  playLibrarySong: (index: number, context?: PlayContext, catalogRevision?: string | null | undefined) => Promise<void>;
  pushLibraryState: () => void;
  recoverCatalogBrowse: (error: unknown, catalog: CatalogIdentity | null) => boolean;
  showLibraryList: (key: string | null, list: LibraryList) => void;
  startSongPage: (filter: LibraryFilter, playContext: PlayContext, albumKey?: string | null, append?: boolean, albumIdentity?: AlbumBrowseIdentity | undefined) => Promise<void>;
}

const openGroup = async (deps: LibraryCollectionsDependencies, group: LibraryGroup, kind: 'artist' | 'albumArtist' | 'genre') => {
  const { libraryContextRef, setState } = deps.shared;
  const { startSongPage } = deps;
  if (kind === 'genre') {
    libraryContextRef.current = null;
    setState((prev) => ({ ...prev, libraryNestedTitle: 'Tracks' }));
    await startSongPage({ genre: group.name }, {}, null, false);
    return;
  }
  await loadGroupAlbums(deps, { kind, name: group.name });
};

const loadGroupAlbums = async (deps: LibraryCollectionsDependencies, context: LibraryContext) => {
  const {
    activeCatalogRef, apiRef, extensionPageRef, featureSetRef, libraryBrowseCatalogRef,
    libraryContextRef, libraryEntriesRef, libraryLoadGenerationRef, libraryPageRef, librarySortingRef,
    setState, syncedCatalogStoreRef,
  } = deps.shared;
  const { recoverCatalogBrowse, showLibraryList } = deps;
  if (extensionPageRef.current?.kind === 'orderedAlbums') extensionPageRef.current = null;
  setState((prev) => ({
    ...prev,
    libraryNestedTitle: 'Albums',
    libraryStatus: ContentStatus.Loading,
    libraryEntries: [],
    libraryCountLabel: null,
    libraryHasMore: false,
  }));

  const api = apiRef.current;
  const catalog = activeCatalogRef.current;
  const factory = libraryEntriesRef.current;
  const generation = ++libraryLoadGenerationRef.current;
  libraryContextRef.current = context;
  libraryPageRef.current = null;
  libraryBrowseCatalogRef.current = null;

  try {
    const sort = context.kind === 'artist' ? librarySortingRef.current?.artists : librarySortingRef.current?.albumArtists;
    if (api && featureSetRef.current.has('library_sorting') && isServerOrderedAlbumSort(sort)) {
      const page = await readOrderedAlbumPage(api, context);
      if (generation === libraryLoadGenerationRef.current && api === apiRef.current) {
        showLibraryList(null, orderedAlbumList(factory, context, page));
      }
      return;
    }

    libraryBrowseCatalogRef.current = catalog;
    const albums = await loadGroupAlbumRows(context, api, catalog, syncedCatalogStoreRef.current);
    if (generation !== libraryLoadGenerationRef.current || api !== apiRef.current) return;
    const entries = factory.albums(albums, context);
    setState((prev) => ({
      ...prev,
      libraryEntries: entries,
      libraryCountLabel: `${entries.length} albums · ${albums.reduce((count, album) => count + album.count, 0)} tracks`,
      libraryStatus: entries.length > 0 ? ContentStatus.Ready : ContentStatus.Empty,
    }));
  } catch (err: any) {
    if (generation !== libraryLoadGenerationRef.current || api !== apiRef.current) return;
    if (recoverCatalogBrowse(err, catalog)) return loadGroupAlbums(deps, context);
    setState((prev) => ({
      ...prev,
      libraryStatus: ContentStatus.Error,
      libraryCountLabel: err?.message || 'Failed to load albums',
    }));
  }
};

const browseAlbum = async (deps: LibraryCollectionsDependencies, album: LibraryGroup, context: LibraryContext | null) => {
  const { setState } = deps.shared;
  const { startSongPage } = deps;
  setState((prev) => ({ ...prev, libraryNestedTitle: 'Tracks' }));
  const artist = context?.kind === 'artist' ? context.name : undefined;
  const albumArtist =
    context?.kind === 'albumArtist'
      ? context.name
      : album.albumArtist && album.albumArtist.trim().length > 0
      ? album.albumArtist
      : undefined;

  const filter: LibraryFilter = artist
    ? { artist, album: album.name }
    : albumArtist
    ? { albumArtist, album: album.name }
    : { album: album.name };

  const playContext: PlayContext = artist
    ? { artist, album: album.name }
    : albumArtist
    ? { albumArtist, album: album.name }
    : { album: album.name };

  await startSongPage(filter, playContext, album.albumKey ?? null, false, { name: album.name, albumArtist: album.albumArtist ?? '', representativeId: album.index });
};

const browsePlaylist = async (deps: LibraryCollectionsDependencies, playlist: Playlist) => {
  const {
    activePlaylistRef, apiRef, connectionAttemptRef, extensionPageRef, libraryEntriesRef,
    libraryLoadGenerationRef, setState,
  } = deps.shared;
  const factory = libraryEntriesRef.current;
  const generation = ++libraryLoadGenerationRef.current;
  const attempt = connectionAttemptRef.current;
  activePlaylistRef.current = playlist;
  setState((prev) => ({
    ...prev,
    libraryNestedTitle: playlist.name,
    libraryEntries: [],
    libraryStatus: ContentStatus.Loading,
    libraryCountLabel: null,
    libraryHasMore: false,
    activePlaylist: playlist,
  }));

  const api = apiRef.current;
  if (!api) return;

  try {
    const page = await readNetworkSongPage(api, () => api.playlistPage(playlist.key));
    if (api !== apiRef.current || attempt !== connectionAttemptRef.current || generation !== libraryLoadGenerationRef.current) return;
    const entries = factory.songs(page.songs, { playlist: playlist.key }, page);
    extensionPageRef.current = { kind: 'playlist', key: playlist.key, nextOffset: page.nextOffset, total: page.total };
    setState((prev) => ({
      ...prev,
      libraryEntries: entries,
      libraryStatus: entries.length > 0 ? ContentStatus.Ready : ContentStatus.Empty,
      libraryCountLabel: `${page.total} tracks · ${playlist.name}`,
      libraryHasMore: page.nextOffset < page.total,
      playlistRevision: page.revision,
      playlistTrackCount: page.total,
    }));
  } catch (err: any) {
    if (api !== apiRef.current || attempt !== connectionAttemptRef.current || generation !== libraryLoadGenerationRef.current) return;
    setState((prev) => ({
      ...prev,
      libraryStatus: ContentStatus.Error,
      libraryCountLabel: err?.message || 'Failed to load playlist tracks',
    }));
  }
};

const browseFolder = async (deps: LibraryCollectionsDependencies, root: string, path: string, name: string) => {
  const {
    apiRef, connectionAttemptRef, extensionPageRef, libraryEntriesRef, libraryLoadGenerationRef,
    setState,
  } = deps.shared;
  const factory = libraryEntriesRef.current;
  const generation = ++libraryLoadGenerationRef.current;
  const attempt = connectionAttemptRef.current;
  const api = apiRef.current;
  if (!api) return;
  setState((prev) => ({
    ...prev, libraryNestedTitle: name, libraryEntries: [],
    libraryStatus: ContentStatus.Loading, libraryCountLabel: null,
    libraryHasMore: false, folderPath: path, folderRoot: root,
  }));
  try {
    const page = await api.folder(path, 0, root);
    if (generation !== libraryLoadGenerationRef.current || api !== apiRef.current || attempt !== connectionAttemptRef.current) return;
    const entries = factory.folderItems(page.entries, root, path);
    extensionPageRef.current = { kind: 'folder', root, path, nextOffset: page.nextOffset, total: page.total };
    setState((prev) => ({
      ...prev, libraryEntries: entries,
      libraryStatus: entries.length ? ContentStatus.Ready : ContentStatus.Empty,
      libraryCountLabel: `${page.total} items`, libraryHasMore: page.nextOffset < page.total,
    }));
  } catch (err: any) {
    if (generation !== libraryLoadGenerationRef.current || api !== apiRef.current || attempt !== connectionAttemptRef.current) return;
    setState((prev) => ({ ...prev, libraryStatus: ContentStatus.Error, connectionMessage: err?.message || 'Could not open folder' }));
  }
};

const selectLibraryEntry = async (deps: LibraryCollectionsDependencies, id: string) => {
  const {
    apiRef, currentLibraryCategoryRef, featureSetRef, libraryLoadGenerationRef, setState, stateRef,
  } = deps.shared;
  const { libraryLoadContext, libraryTarget, playLibrarySong, pushLibraryState, showLibraryList } = deps;
  if (id === TOP_RATED_ALBUMS_ROW.id) {
    const api = apiRef.current;
    if (!api || !featureSetRef.current.has('top_rated_albums') || currentLibraryCategoryRef.current !== LibraryCategory.Playlists || stateRef.current.libraryIsNested) return;
    pushLibraryState();
    const generation = libraryLoadGenerationRef.current;
    setState((prev) => ({ ...prev, libraryNestedTitle: TOP_RATED_ALBUMS_ROW.title, libraryEntries: [], libraryCountLabel: null, libraryHasMore: false, libraryStatus: ContentStatus.Loading, connectionMessage: null }));
    try {
      const list = await loadTopRatedAlbums(libraryLoadContext(api));
      if (api === apiRef.current && generation === libraryLoadGenerationRef.current) showLibraryList(null, list);
    } catch (err: any) {
      if (api === apiRef.current && generation === libraryLoadGenerationRef.current) setState((prev) => ({ ...prev, libraryStatus: ContentStatus.Error, libraryCountLabel: err?.message || 'Failed to load albums' }));
    }
    return;
  }
  const target = libraryTarget(id);
  if (!target) return;

  switch (target.type) {
    case 'Song':
      await playLibrarySong(target.song.index, target.context, target.catalogRevision);
      break;
    case 'Playlist':
      pushLibraryState();
      await browsePlaylist(deps, target.playlist);
      break;
    case 'Group':
      pushLibraryState();
      await openGroup(deps, target.group, target.kind);
      break;
    case 'Album':
      pushLibraryState();
      await browseAlbum(deps, target.group, target.context);
      break;
    case 'Folder':
      pushLibraryState();
      await browseFolder(deps, target.root, target.path, target.name);
      break;
    case 'FolderTrack':
      if (target.item.type === 'track') {
        try {
          await apiRef.current?.playFolderTrack(target.path, target.root);
        } catch (err: any) {
          setState((prev) => ({ ...prev, connectionMessage: err?.message || 'Could not play file' }));
        }
      } else {
        setState((prev) => ({ ...prev, connectionMessage: 'Open playlist files from the Playlists section.' }));
      }
      break;
  }
};

/** The song's album key from the synced catalog: by song id, else by a unique title/artist/album match. */
const catalogAlbumKey = async (
  store: SessionState['syncedCatalogStoreRef']['current'],
  catalog: CatalogIdentity,
  target: AlbumLookupTarget,
): Promise<string | null> => {
  if (target.albumKey) return target.albumKey;
  if (target.songId != null && Number.isSafeInteger(target.songId) && target.songId > 0) {
    const bySongId = await store.albumKeyForSong(catalog.libraryId, catalog.revision, target.songId);
    if (bySongId) return bySongId;
  }
  if (!target.title?.trim()) return null;
  const keys = await store.albumKeysForTrack(
    catalog.libraryId, catalog.revision, target.title.trim(), (target.artist ?? '').trim(), target.album.trim(),
  );
  return keys.length === 1 ? keys[0] : null;
};

export type AlbumJumpLookup = { group: LibraryGroup } | { error: string };

/** Finds the album for Go to Album without touching any state; never guesses between albums of the same name. */
const findAlbumForJump = async (deps: LibraryCollectionsDependencies, target: AlbumLookupTarget): Promise<AlbumJumpLookup> => {
  const { activeCatalogRef, syncedCatalogStoreRef } = deps.shared;
  const notFound = { error: 'Could not find this album in the library.' };
  const catalog = activeCatalogRef.current;
  if (!catalog) {
    const albumArtist = target.albumArtist?.trim();
    if (!albumArtist) return { error: 'Sync the player library before browsing this album.' };
    return { group: { name: target.album.trim(), count: 0, index: target.songId ?? -1, albumArtist, albumKey: target.albumKey ?? null } };
  }
  try {
    const store = syncedCatalogStoreRef.current;
    const albumKey = await catalogAlbumKey(store, catalog, target);
    if (!albumKey) return notFound;
    const candidates = await store.groups(catalog.libraryId, catalog.revision, CatalogGroupKind.Album, target.album.trim(), null, null);
    const group = resolveAlbumGroup(candidates, { ...target, albumKey });
    return group ? { group } : notFound;
  } catch {
    return notFound;
  }
};

export function createLibraryCollections(deps: LibraryCollectionsDependencies) {
  return {
    loadGroupAlbums: loadGroupAlbums.bind(undefined, deps),
    browsePlaylist: browsePlaylist.bind(undefined, deps),
    selectLibraryEntry: selectLibraryEntry.bind(undefined, deps),
    findAlbumForJump: findAlbumForJump.bind(undefined, deps),
    openAlbumGroup: (group: LibraryGroup) => browseAlbum(deps, group, null),
  };
}
