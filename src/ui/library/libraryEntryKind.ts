import { LibraryCategory, LibraryEntry, RemoteTrack } from '../../data/types';
import { IconName } from '../components/iconPaths';

export type LibraryEntryKind =
  | 'song'
  | 'album'
  | 'artist'
  | 'genre'
  | 'playlist'
  | 'folder'
  | 'playlistFile'
  | 'folderTrack'
  | 'other';

export interface LibraryEntryContext {
  category: LibraryCategory;
  isNested: boolean;
  nestedTitle?: string | null;
}

const SEARCH_PREFIXES: [string, LibraryEntryKind][] = [
  ['Artist · ', 'artist'],
  ['Album · ', 'album'],
  ['Genre · ', 'genre'],
];

const NESTED_ALBUMS_TITLE = 'Albums';
const SEARCH_TRACK_PREFIX = 'Track · ';

export function libraryEntryKind(entry: LibraryEntry, context: LibraryEntryContext): LibraryEntryKind {
  if (entry.kind === 'song') return 'song';
  if (entry.playlistKey) return 'playlist';
  if (context.category === LibraryCategory.Folders) {
    if (entry.subtitle === 'Folder') return 'folder';
    if (entry.subtitle === 'Playlist file') return 'playlistFile';
    return 'folderTrack';
  }
  if (context.isNested && context.nestedTitle === NESTED_ALBUMS_TITLE) return 'album';
  if (context.category === LibraryCategory.Search) {
    return SEARCH_PREFIXES.find(([prefix]) => entry.subtitle.startsWith(prefix))?.[1] ?? 'other';
  }
  if (context.isNested) return 'other';
  switch (context.category) {
    case LibraryCategory.Albums:
      return 'album';
    case LibraryCategory.Artists:
    case LibraryCategory.AlbumArtists:
      return 'artist';
    case LibraryCategory.Genres:
      return 'genre';
    default:
      return 'other';
  }
}

const PLACEHOLDER_ICONS: Record<LibraryEntryKind, IconName> = {
  song: 'music',
  album: 'disc',
  artist: 'person',
  genre: 'genre',
  playlist: 'playlist',
  folder: 'folder',
  playlistFile: 'file',
  folderTrack: 'music',
  other: 'music',
};

export function placeholderIconFor(kind: LibraryEntryKind): IconName {
  return PLACEHOLDER_ICONS[kind];
}

export function opensCollection(kind: LibraryEntryKind): boolean {
  return kind === 'album' || kind === 'artist' || kind === 'genre' || kind === 'playlist' || kind === 'folder';
}

export function displaySubtitle(entry: LibraryEntry): string {
  return entry.subtitle.startsWith(SEARCH_TRACK_PREFIX)
    ? entry.subtitle.slice(SEARCH_TRACK_PREFIX.length)
    : entry.subtitle;
}

export function isCurrentEntry(entry: LibraryEntry, track?: RemoteTrack | null): boolean {
  if (!track || entry.kind !== 'song') return false;
  return entry.title === track.title && (!track.artist || displaySubtitle(entry) === track.artist);
}
