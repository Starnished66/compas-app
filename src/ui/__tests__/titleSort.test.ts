import { resortByTitle, sortByTitle } from '../library/titleSort';

const entry = (id: string, title: string, artwork?: string) => ({ id, title, artwork });

describe('sortByTitle', () => {
  it('orders by title ignoring case and accents without mutating the input', () => {
    const entries = [entry('1', 'zebra'), entry('2', 'Émile'), entry('3', 'apple'), entry('4', 'Banana')];
    expect(sortByTitle(entries).map((item) => item.title)).toEqual(['apple', 'Banana', 'Émile', 'zebra']);
    expect(entries[0].title).toBe('zebra');
  });
});

describe('resortByTitle', () => {
  const source = [entry('1', 'Charlie'), entry('2', 'alpha'), entry('3', 'Bravo')];
  const sorted = sortByTitle(source);

  it('reuses the previous order when only non-title fields changed', () => {
    const withArtwork = source.map((item) => ({ ...item, artwork: `cover-${item.id}` }));
    const next = resortByTitle(withArtwork, { source, sorted });
    expect(next.map((item) => item.id)).toEqual(['2', '3', '1']);
    expect(next.every((item) => item.artwork === `cover-${item.id}`)).toBe(true);
  });

  it('sorts again when titles or membership change', () => {
    const renamed = [entry('1', 'aardvark'), entry('2', 'alpha'), entry('3', 'Bravo')];
    expect(resortByTitle(renamed, { source, sorted }).map((item) => item.id)).toEqual(['1', '2', '3']);
    const grown = [...source, entry('4', 'Able')];
    expect(resortByTitle(grown, { source, sorted }).map((item) => item.id)).toEqual(['4', '2', '3', '1']);
  });
});
