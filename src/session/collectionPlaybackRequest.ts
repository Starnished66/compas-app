import {
  CollectionPlayRequest,
  LibraryCategory,
  LibraryFilter,
  PlaybackMode,
  Playlist,
} from '../data/types';
import { LibraryContext } from './LibraryEntryFactory';

export interface CollectionPlaybackRequestInput {
  category: LibraryCategory;
  nestedTitle?: string | null;
  isNested: boolean;
  query: string;
  playlist?: Playlist | null;
  libraryContext?: LibraryContext | null;
  pageFilter?: LibraryFilter | null;
  albumIdentity?: { name: string; albumArtist: string } | null;
  playbackMode: PlaybackMode;
  catalogRevision?: string | null;
  supportsShuffleModes: boolean;
  shuffle: boolean;
}

function playbackModeNumber(mode: PlaybackMode, shuffle: boolean, supportsShuffleModes: boolean): number {
  const repeatsAll = mode === PlaybackMode.RepeatAll || mode === PlaybackMode.ShuffleRepeat;
  if (shuffle) return repeatsAll || !supportsShuffleModes ? 3 : 4;
  if (mode === PlaybackMode.RepeatOne) return 2;
  return repeatsAll ? 1 : 0;
}

function hasUnsupportedPageFilters(filter: LibraryFilter | null | undefined): boolean {
  return !!filter && (filter.artist != null || filter.albumArtist != null || filter.album != null);
}

/** Builds the exact native collection request for the currently visible scope. */
export function buildCollectionPlaybackRequest(
  input: CollectionPlaybackRequestInput,
): CollectionPlayRequest | null {
  const request: CollectionPlayRequest = {
    scope: 'all',
    mode: playbackModeNumber(input.playbackMode, input.shuffle, input.supportsShuffleModes),
    catalogRevision: input.catalogRevision ?? null,
  };

  if (input.playlist) {
    if (input.playlist.key === '@favorites') request.scope = 'favorites';
    else if (input.playlist.key === '@recently_played') request.scope = 'recently_played';
    else if (!input.playlist.key.startsWith('@')) {
      request.scope = 'playlist';
      request.name = input.playlist.key;
    } else return null;
    return request;
  }

  if (input.albumIdentity) {
    request.scope = 'album';
    request.name = input.albumIdentity.name;
    if (input.pageFilter?.artist != null) request.artist = input.pageFilter.artist;
    else request.albumArtist = input.albumIdentity.albumArtist;
    return request;
  }

  if (input.isNested && input.nestedTitle === 'Albums' && input.libraryContext) {
    request.scope = input.libraryContext.kind === 'artist' ? 'artist' : 'album_artist';
    request.name = input.libraryContext.name;
    return request;
  }

  const filter = input.pageFilter;
  if (filter?.genre != null) {
    if (hasUnsupportedPageFilters(filter)) return null;
    request.scope = 'genre';
    request.name = filter.genre;
    return request;
  }
  if (hasUnsupportedPageFilters(filter)) return null;

  if (input.category === LibraryCategory.Favorites) {
    request.scope = 'favorites';
    return request;
  }
  if (input.category === LibraryCategory.Recent) {
    request.scope = 'recently_played';
    return request;
  }
  if (input.category !== LibraryCategory.Songs || input.query) return null;

  return request;
}
