import { RemoteApi } from '../data/RemoteApi';
import { CatalogGroup, CatalogGroupKind, CatalogIdentity, SyncedCatalogStore } from '../data/SyncedCatalogStore';
import { CatalogSong, LibraryCategory, LibraryEntry, LibraryGroup, Song } from '../data/types';
import { GroupKind, LibraryEntryFactory } from './LibraryEntryFactory';
import { ExtensionPage, LibraryList } from './LibraryListCache';
import { sortedByTitle } from './titleOrder';

export const LIBRARY_PAGE_SIZE = 50;

export interface CategoryLoadContext {
  api: RemoteApi;
  catalog: CatalogIdentity | null;
  store: SyncedCatalogStore;
  entries: LibraryEntryFactory;
  features: ReadonlySet<string>;
}

interface GroupCategory {
  catalogKind: CatalogGroupKind;
  entryKind: GroupKind | 'album';
  fetch(api: RemoteApi): Promise<LibraryGroup[]>;
  noun: string;
}

const GROUP_CATEGORIES: Partial<Record<LibraryCategory, GroupCategory>> = {
  [LibraryCategory.Albums]: { catalogKind: CatalogGroupKind.Album, entryKind: 'album', fetch: (api) => api.albums(), noun: 'albums' },
  [LibraryCategory.Artists]: { catalogKind: CatalogGroupKind.Artist, entryKind: 'artist', fetch: (api) => api.artists(), noun: 'artists' },
  [LibraryCategory.AlbumArtists]: {
    catalogKind: CatalogGroupKind.AlbumArtist,
    entryKind: 'albumArtist',
    fetch: (api) => api.albumArtists(),
    noun: 'album artists',
  },
  [LibraryCategory.Genres]: { catalogKind: CatalogGroupKind.Genre, entryKind: 'genre', fetch: (api) => api.genres(), noun: 'genres' },
};

export function songFromCatalog(song: CatalogSong): Song {
  return {
    index: song.id,
    title: song.title,
    artist: song.artist,
    album: song.album,
    albumArtist: song.albumArtist,
    genre: song.genre,
    trackNumber: song.trackNumber,
    discNumber: song.discNumber,
    albumKey: song.albumKey,
  };
}

export function libraryGroupFromCatalog(group: CatalogGroup): LibraryGroup {
  return {
    name: group.name,
    count: group.count,
    index: group.index,
    albumArtist: group.albumArtist,
    albumKey: group.albumKey ?? null,
  };
}

function requireFeature(context: CategoryLoadContext, feature: string, message: string): void {
  if (!context.features.has(feature)) throw new Error(message);
}

function list(entries: LibraryEntry[], total: number, label: string, extensionPage: ExtensionPage | null = null): LibraryList {
  return {
    entries,
    total,
    label,
    extensionPage,
    hasMore: extensionPage ? extensionPage.nextOffset < extensionPage.total : entries.length < total,
  };
}

async function songsPage(context: CategoryLoadContext, offset: number, query: string | null) {
  const { catalog, store, api } = context;
  if (!catalog) return api.library(offset, LIBRARY_PAGE_SIZE, query);
  const page = await store.songPage(catalog.libraryId, catalog.revision, offset, LIBRARY_PAGE_SIZE, query);
  return { total: page.total, songs: page.songs.map(songFromCatalog) };
}

async function groupList(context: CategoryLoadContext, group: GroupCategory, query: string | null): Promise<LibraryGroup[]> {
  const { catalog, store, api } = context;
  if (!catalog) {
    const groups = await group.fetch(api);
    if (!query) return groups;
    const term = query.toLocaleLowerCase();
    return groups.filter((item) => item.name.toLocaleLowerCase().includes(term));
  }
  const stored = await store.groups(catalog.libraryId, catalog.revision, group.catalogKind, query);
  return stored.map(libraryGroupFromCatalog);
}

function groupEntries(context: CategoryLoadContext, group: GroupCategory, groups: LibraryGroup[]): LibraryEntry[] {
  return group.entryKind === 'album' ? context.entries.albums(groups, null) : context.entries.groups(groups, group.entryKind);
}

async function searchList(context: CategoryLoadContext, term: string): Promise<LibraryList> {
  const [artists, albums, genres, songs] = await Promise.all([
    groupList(context, GROUP_CATEGORIES[LibraryCategory.Artists]!, term),
    groupList(context, GROUP_CATEGORIES[LibraryCategory.Albums]!, term),
    groupList(context, GROUP_CATEGORIES[LibraryCategory.Genres]!, term),
    songsPage(context, 0, term),
  ]);
  const factory = context.entries;
  const songEntries = factory.songs(songs.songs, {}, context.catalog?.revision ?? null);
  const entries = [
    ...factory.groups(artists, 'artist').map((entry, i) => ({ ...entry, subtitle: `Artist · ${artists[i].count} tracks` })),
    ...factory
      .albums(albums, null)
      .map((entry, i) => ({ ...entry, subtitle: `Album · ${albums[i].albumArtist || albums[i].count + ' tracks'}` })),
    ...factory.groups(genres, 'genre').map((entry, i) => ({ ...entry, subtitle: `Genre · ${genres[i].count} tracks` })),
    ...songEntries.map((entry, i) => ({ ...entry, subtitle: `Track · ${songs.songs[i].artist || 'Unknown artist'}` })),
  ];
  const groupCount = artists.length + albums.length + genres.length;
  return {
    entries,
    total: songs.total,
    label: `${groupCount} groups · ${songs.total} tracks`,
    hasMore: songEntries.length < songs.total,
    extensionPage: null,
  };
}

export async function loadCategoryList(
  category: LibraryCategory,
  query: string | null,
  context: CategoryLoadContext,
): Promise<LibraryList> {
  const { api, entries: factory } = context;
  const group = GROUP_CATEGORIES[category];
  if (group) {
    const groups = sortedByTitle(await groupList(context, group, query), (item) => item.name);
    return list(groupEntries(context, group, groups), groups.length, `${groups.length} ${group.noun}`);
  }

  switch (category) {
    case LibraryCategory.Folders: {
      requireFeature(context, 'folder_browse', 'Folder browsing requires a newer player build');
      const roots = await api.folderRoots();
      const root = roots.find((item) => item.id === 'sd');
      if (!root?.available) throw new Error('The player SD card is unavailable');
      const page = await api.folder('', 0, root.id);
      return list(factory.folderItems(page.entries, root.id, ''), page.total, `${page.total} items · ${root.name}`, {
        kind: 'folder',
        root: root.id,
        path: '',
        nextOffset: page.nextOffset,
        total: page.total,
      });
    }
    case LibraryCategory.Recent: {
      requireFeature(context, 'recently_played', 'Recently played requires a newer player build');
      const page = await api.recent();
      return list(factory.songs(page.songs, { playlist: '@recently_played' }), page.total, `${page.total} recently played tracks`, {
        kind: 'recent',
        nextOffset: page.nextOffset,
        total: page.total,
      });
    }
    case LibraryCategory.Favorites: {
      requireFeature(context, 'favorites_edit', 'Favorites requires a newer player build');
      const page = await api.playlistPage('@favorites');
      return list(factory.songs(page.songs, { playlist: '@favorites' }), page.total, `${page.total} favorites`, {
        kind: 'playlist',
        key: '@favorites',
        nextOffset: page.nextOffset,
        total: page.total,
      });
    }
    case LibraryCategory.Playlists: {
      const playlists = await api.playlists();
      return list(factory.playlists(playlists), playlists.length, `${playlists.length} playlists`);
    }
    case LibraryCategory.Songs: {
      const page = await songsPage(context, 0, query);
      return list(factory.songs(page.songs, {}, context.catalog?.revision ?? null), page.total, `${page.total} tracks`);
    }
    case LibraryCategory.Search: {
      const term = query?.trim() || '';
      return term ? searchList(context, term) : list([], 0, '');
    }
  }
  return list([], 0, '');
}

export async function loadSongsAfter(
  context: CategoryLoadContext,
  shown: LibraryEntry[],
  offset: number,
  query: string | null,
): Promise<{ entries: LibraryEntry[]; total: number }> {
  const page = await songsPage(context, offset, query);
  return { entries: context.entries.songs(page.songs, {}, context.catalog?.revision ?? null, shown), total: page.total };
}
