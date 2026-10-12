import { LibraryEntry } from '../../data/types';
import { reconcileEntries } from '../reconcileEntries';

const entry = (id: string, title = id, extra: Partial<LibraryEntry> = {}): LibraryEntry => ({ id, title, subtitle: '', ...extra });

describe('reconcileEntries', () => {
  it('keeps the previous list when nothing changed', () => {
    const previous = [entry('a'), entry('b')];
    expect(reconcileEntries(previous, [entry('a'), entry('b')])).toBe(previous);
  });

  it('reuses unchanged entries and replaces changed or new ones', () => {
    const previous = [entry('a'), entry('b'), entry('c')];
    const next = reconcileEntries(previous, [entry('b'), entry('a', 'A renamed'), entry('d')]);
    expect(next).not.toBe(previous);
    expect(next[0]).toBe(previous[1]);
    expect(next[1]).not.toBe(previous[0]);
    expect(next[1].title).toBe('A renamed');
    expect(next[2].id).toBe('d');
  });

  it('treats a shorter list as a change', () => {
    const previous = [entry('a'), entry('b')];
    const next = reconcileEntries(previous, [entry('a')]);
    expect(next).toEqual([previous[0]]);
    expect(next[0]).toBe(previous[0]);
  });

  it('returns the fresh list when nothing was shown', () => {
    const fresh = [entry('a')];
    expect(reconcileEntries([], fresh)).toBe(fresh);
  });
});
