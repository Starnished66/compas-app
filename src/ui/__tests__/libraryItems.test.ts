import { LibraryCategory } from '../../data/types';
import { entryItems, withLetterHeaders } from '../library/libraryItems';

const entry = (id: string) => ({ id, title: id, subtitle: '' });
const entries = ['a', 'b', 'c'].map(entry);

describe('entryItems keys', () => {
  it('keys sortable root lists by position so a re-sort keeps the mounted rows', () => {
    const items = entryItems(entries, { category: LibraryCategory.Artists, isNested: false });
    const reversed = entryItems([...entries].reverse(), { category: LibraryCategory.Artists, isNested: false });
    expect(items.map((item) => item.key)).toEqual(['row:0', 'row:1', 'row:2']);
    expect(reversed.map((item) => item.key)).toEqual(['row:0', 'row:1', 'row:2']);
    expect(reversed[0].type === 'entry' && reversed[0].entry.id).toBe('c');
  });

  it('keys nested, unsorted and search lists by entry id', () => {
    const nested = entryItems(entries, { category: LibraryCategory.Artists, isNested: true });
    const songs = entryItems(entries, { category: LibraryCategory.Songs, isNested: false });
    const search = entryItems(entries, { category: LibraryCategory.Search, isNested: false });
    for (const items of [nested, songs, search]) expect(items.map((item) => item.key)).toEqual(['a', 'b', 'c']);
  });

  it('derives unique letter header keys from the row keys', () => {
    const items = withLetterHeaders(entryItems(entries, { category: LibraryCategory.Songs, isNested: false }), (item) =>
      item.title.toUpperCase(),
    );
    expect(new Set(items.map((item) => item.key)).size).toBe(items.length);
  });
});
