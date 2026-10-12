import { sortedByTitle, titleSortKey } from '../titleOrder';

const titles = (items: { title: string }[]) => items.map((item) => item.title);
const byTitle = (item: { title: string }) => item.title;

describe('titleSortKey', () => {
  it('ignores case and accents', () => {
    expect(titleSortKey('Émile')).toBe('emile');
    expect(titleSortKey('ÁNGEL')).toBe('angel');
    expect(titleSortKey('Straße')).toBe('strasse');
    expect(titleSortKey('Ølafur')).toBe('olafur');
  });
});

describe('sortedByTitle', () => {
  it('orders like a base-sensitivity collator without mutating the input', () => {
    const items = [{ title: 'zebra' }, { title: 'Émile' }, { title: 'apple' }, { title: 'Banana' }];
    expect(titles(sortedByTitle(items, byTitle))).toEqual(['apple', 'Banana', 'Émile', 'zebra']);
    expect(items[0].title).toBe('zebra');
  });

  it('keeps the incoming order for titles that compare equal', () => {
    const items = [{ title: 'abba', id: 1 }, { title: 'Zed', id: 2 }, { title: 'ABBA', id: 3 }, { title: 'Abbá', id: 4 }];
    expect(sortedByTitle(items, byTitle).map((item) => item.id)).toEqual([1, 3, 4, 2]);
  });

  it('returns already ordered input unchanged', () => {
    const items = [{ title: 'Alpha' }, { title: 'beta' }, { title: 'Gamma' }];
    const sorted = sortedByTitle(items, byTitle);
    expect(sorted).not.toBe(items);
    expect(sorted).toEqual(items);
  });
});
