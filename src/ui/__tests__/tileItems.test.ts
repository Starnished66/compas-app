import { LibraryItem, tileItems } from '../library/libraryItems';

const entry = (id: string) => ({ id, title: id, subtitle: '' });

function tileIds(rows: LibraryItem[]): string[][] {
  return rows.map((row) => (row.type === 'tiles' ? row.entries.map((item) => item.id) : []));
}

describe('tileItems', () => {
  const entries = ['a', 'b', 'c', 'd', 'e'].map(entry);

  it('splits entries into position-keyed rows', () => {
    const rows = tileItems(entries, 2);
    expect(rows.map((row) => row.key)).toEqual(['tiles:0', 'tiles:1', 'tiles:2']);
    expect(tileIds(rows)).toEqual([['a', 'b'], ['c', 'd'], ['e']]);
  });

  it('reuses rows whose entries are unchanged when more entries arrive', () => {
    const previous = tileItems(entries, 2);
    const next = tileItems([...entries, entry('f')], 2, previous);
    expect(next[0]).toBe(previous[0]);
    expect(next[1]).toBe(previous[1]);
    expect(next[2]).not.toBe(previous[2]);
    expect(tileIds(next)[2]).toEqual(['e', 'f']);
  });

  it('rebuilds rows whose entries changed', () => {
    const previous = tileItems(entries, 2);
    const changed = [...entries];
    changed[3] = { ...entries[3], title: 'renamed' };
    const next = tileItems(changed, 2, previous);
    expect(next[0]).toBe(previous[0]);
    expect(next[1]).not.toBe(previous[1]);
    expect(next[2]).toBe(previous[2]);
  });

  it('rebuilds every row when the column count changes', () => {
    const previous = tileItems(entries, 2);
    const next = tileItems(entries, 3, previous);
    expect(next.some((row, index) => row === previous[index])).toBe(false);
    expect(tileIds(next)).toEqual([['a', 'b', 'c'], ['d', 'e']]);
  });
});
