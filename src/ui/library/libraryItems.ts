import { ReactElement } from 'react';
import { LibraryEntry } from '../../data/types';
import { isSortableCategory } from './libraryCategories';
import { LibraryEntryContext, LibraryEntryKind, libraryEntryKind } from './libraryEntryKind';

export type LibraryItem =
  | { key: string; type: 'node'; node: ReactElement }
  | { key: string; type: 'entry'; entry: LibraryEntry; kind: LibraryEntryKind; number?: number }
  | { key: string; type: 'tiles'; entries: LibraryEntry[] }
  | { key: string; type: 'letter'; letter: string }
  | { key: string; type: 'playlistTrack'; entry: LibraryEntry; index: number };

export function nodeItem(key: string, node: ReactElement): LibraryItem {
  return { key, type: 'node', node };
}

function keysEntriesByPosition(context: LibraryEntryContext): boolean {
  return !context.isNested && isSortableCategory(context.category);
}

export function entryItems(
  entries: LibraryEntry[],
  context: LibraryEntryContext,
  numbered = false,
): LibraryItem[] {
  const byPosition = keysEntriesByPosition(context);
  return entries.map((entry, index) => ({
    key: byPosition ? `row:${index}` : entry.id,
    type: 'entry',
    entry,
    kind: libraryEntryKind(entry, context),
    number: numbered ? index + 1 : undefined,
  }));
}

export function tileItems(
  entries: LibraryEntry[],
  columns: number,
  previous: readonly LibraryItem[] = [],
): LibraryItem[] {
  const rows: LibraryItem[] = [];
  for (let start = 0; start < entries.length; start += columns) {
    const end = Math.min(start + columns, entries.length);
    const key = `tiles:${start / columns}`;
    const reusable = previous[rows.length];
    rows.push(
      reusable && reusable.key === key && holdsTiles(reusable, entries, start, end)
        ? reusable
        : { key, type: 'tiles', entries: entries.slice(start, end) },
    );
  }
  return rows;
}

function holdsTiles(item: LibraryItem, entries: LibraryEntry[], start: number, end: number): boolean {
  if (item.type !== 'tiles' || item.entries.length !== end - start) return false;
  for (let index = start; index < end; index++) {
    if (item.entries[index - start] !== entries[index]) return false;
  }
  return true;
}

export function playlistTrackItems(entries: LibraryEntry[]): LibraryItem[] {
  return entries.map((entry, index) => ({ key: entry.id, type: 'playlistTrack', entry, index }));
}

export function withLetterHeaders(items: LibraryItem[], letterOf: (entry: LibraryEntry) => string): LibraryItem[] {
  const result: LibraryItem[] = [];
  let previous: string | null = null;
  for (const item of items) {
    if (item.type === 'entry') {
      const letter = letterOf(item.entry);
      if (letter !== previous) {
        result.push({ key: `letter:${letter}:${item.key}`, type: 'letter', letter });
        previous = letter;
      }
    }
    result.push(item);
  }
  return result;
}

export function entriesOfItem(item: LibraryItem): LibraryEntry[] {
  switch (item.type) {
    case 'entry':
    case 'playlistTrack':
      return [item.entry];
    case 'tiles':
      return item.entries;
    default:
      return [];
  }
}

export function songIds(entries: LibraryEntry[]): string[] {
  return entries.filter((entry) => entry.kind === 'song').map((entry) => entry.id);
}
