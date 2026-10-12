import { LibraryCategory } from '../../data/types';
import { LibraryList, LibraryListCache, needsRevalidation } from '../LibraryListCache';

const list = (title: string): LibraryList => ({
  entries: [{ id: title, title, subtitle: '' }],
  total: 1,
  label: '1 item',
  hasMore: false,
  extensionPage: null,
});

describe('LibraryListCache', () => {
  it('returns lists only for the source they were loaded from', () => {
    const cache = new LibraryListCache();
    const albums = list('albums');
    cache.set('catalog:lib:1', LibraryCategory.Albums, albums);
    expect(cache.get('catalog:lib:1', LibraryCategory.Albums)).toBe(albums);
    expect(cache.get('catalog:lib:2', LibraryCategory.Albums)).toBeUndefined();
    expect(cache.get('catalog:lib:1', LibraryCategory.Artists)).toBeUndefined();
  });

  it('drops every list when a new source is stored', () => {
    const cache = new LibraryListCache();
    cache.set('catalog:lib:1', LibraryCategory.Albums, list('albums'));
    cache.set('catalog:lib:2', LibraryCategory.Artists, list('artists'));
    cache.set('catalog:lib:1', LibraryCategory.Genres, list('genres'));
    expect(cache.get('catalog:lib:1', LibraryCategory.Albums)).toBeUndefined();
    expect(cache.get('catalog:lib:2', LibraryCategory.Artists)).toBeUndefined();
    expect(cache.get('catalog:lib:1', LibraryCategory.Genres)).toBeDefined();
  });

  it('never stores search results and forgets everything on clear', () => {
    const cache = new LibraryListCache();
    cache.set('player:1', LibraryCategory.Search, list('search'));
    expect(cache.get('player:1', LibraryCategory.Search)).toBeUndefined();
    cache.set('player:1', LibraryCategory.Playlists, list('playlists'));
    cache.clear();
    expect(cache.get('player:1', LibraryCategory.Playlists)).toBeUndefined();
  });

  it('revalidates only lists the player edits outside the catalog', () => {
    expect(needsRevalidation(LibraryCategory.Playlists)).toBe(true);
    expect(needsRevalidation(LibraryCategory.Favorites)).toBe(true);
    expect(needsRevalidation(LibraryCategory.Albums)).toBe(false);
    expect(needsRevalidation(LibraryCategory.Songs)).toBe(false);
  });
});
