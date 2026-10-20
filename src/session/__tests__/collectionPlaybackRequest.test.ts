import {
  LibraryCategory,
  PlaybackMode,
} from '../../data/types';
import {
  buildCollectionPlaybackRequest,
  CollectionPlaybackRequestInput,
} from '../collectionPlaybackRequest';

const base: CollectionPlaybackRequestInput = {
  category: LibraryCategory.Songs,
  isNested: false,
  query: '',
  playbackMode: PlaybackMode.Sequential,
  catalogRevision: 'library:7',
  supportsShuffleModes: true,
  shuffle: false,
};

describe('buildCollectionPlaybackRequest', () => {
  it.each([
    ['all tracks', {}, { scope: 'all', mode: 0, catalogRevision: 'library:7' }],
    ['favorites', { category: LibraryCategory.Favorites }, { scope: 'favorites', mode: 0, catalogRevision: 'library:7' }],
    ['recently played', { category: LibraryCategory.Recent }, { scope: 'recently_played', mode: 0, catalogRevision: 'library:7' }],
    ['genre filter', { pageFilter: { genre: 'Ambient' } }, { scope: 'genre', name: 'Ambient', mode: 0, catalogRevision: 'library:7' }],
    ['artist albums detail', { isNested: true, nestedTitle: 'Albums', libraryContext: { kind: 'artist', name: 'Artist' } }, { scope: 'artist', name: 'Artist', mode: 0, catalogRevision: 'library:7' }],
    ['album-artist albums detail', { isNested: true, nestedTitle: 'Albums', libraryContext: { kind: 'albumArtist', name: 'Album Artist' } }, { scope: 'album_artist', name: 'Album Artist', mode: 0, catalogRevision: 'library:7' }],
    ['exact album identity including empty album artist', { albumIdentity: { name: 'Unknown Artist', albumArtist: '' } }, { scope: 'album', name: 'Unknown Artist', albumArtist: '', mode: 0, catalogRevision: 'library:7' }],
    ['album scoped to current artist', { albumIdentity: { name: 'Shared Album', albumArtist: 'Various Artists' }, pageFilter: { artist: 'Artist One', album: 'Shared Album' } }, { scope: 'album', name: 'Shared Album', artist: 'Artist One', mode: 0, catalogRevision: 'library:7' }],
    ['user playlist key', { category: LibraryCategory.Playlists, playlist: { key: 'Beyoncé 日本', name: 'Favorites.m3u', internal: false, writable: true } }, { scope: 'playlist', name: 'Beyoncé 日本', mode: 0, catalogRevision: 'library:7' }],
    ['favorites playlist', { playlist: { key: '@favorites', name: 'Favorites', internal: true, writable: false } }, { scope: 'favorites', mode: 0, catalogRevision: 'library:7' }],
    ['recent playlist', { playlist: { key: '@recently_played', name: 'Recently played', internal: true, writable: false } }, { scope: 'recently_played', mode: 0, catalogRevision: 'library:7' }],
  ])('builds %s request without needing loaded song IDs', (_label, overrides, expected) => {
    expect(buildCollectionPlaybackRequest({ ...base, ...overrides } as CollectionPlaybackRequestInput)).toEqual(expected);
  });

  it.each([
    [PlaybackMode.RepeatAll, 3],
    [PlaybackMode.ShuffleRepeat, 3],
    [PlaybackMode.RepeatOne, 4],
    [PlaybackMode.Sequential, 4],
  ])('uses shuffle mode %i for native shuffle with mode %i', (playbackMode, expectedMode) => {
    expect(buildCollectionPlaybackRequest({ ...base, playbackMode, shuffle: true })?.mode).toBe(expectedMode);
  });

  it('uses legacy repeating shuffle mode when shuffle_modes is unavailable', () => {
    expect(buildCollectionPlaybackRequest({ ...base, shuffle: true, supportsShuffleModes: false })?.mode).toBe(3);
  });

  it('maps normal play to repeat-one and repeat-all modes', () => {
    expect(buildCollectionPlaybackRequest({ ...base, playbackMode: PlaybackMode.RepeatOne })?.mode).toBe(2);
    expect(buildCollectionPlaybackRequest({ ...base, playbackMode: PlaybackMode.RepeatAll })?.mode).toBe(1);
    expect(buildCollectionPlaybackRequest({ ...base, playbackMode: PlaybackMode.ShuffleRepeat })?.mode).toBe(1);
  });

  it.each([
    ['search screen', { category: LibraryCategory.Search }],
    ['folder screen', { category: LibraryCategory.Folders }],
    ['filtered song query', { query: 'live' }],
    ['unsupported artist-filtered songs', { pageFilter: { artist: 'Artist' } }],
    ['unsupported album-filtered songs', { pageFilter: { album: 'Album' } }],
    ['unsupported combined genre filter', { pageFilter: { genre: 'Ambient', artist: 'Artist' } }],
    ['unsupported most-played playlist', { playlist: { key: '@most_played', name: 'Most played', internal: true, writable: false } }],
    ['unscoped playlists screen', { category: LibraryCategory.Playlists }],
  ])('does not broaden %s to All Songs', (_label, overrides) => {
    expect(buildCollectionPlaybackRequest({ ...base, ...overrides } as CollectionPlaybackRequestInput)).toBeNull();
  });
});
