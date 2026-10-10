import { ReactElement } from 'react';
import { LibraryEntry } from '../../data/types';
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

export function entryItems(
  entries: LibraryEntry[],
  context: LibraryEntryContext,
  numbered = false,
): LibraryItem[] {
  return entries.map((entry, index) => ({
    key: entry.id,
    type: 'entry',
    entry,
    kind: libraryEntryKind(entry, context),
    number: numbered ? index + 1 : undefined,
  }));
}

export function tileItems(entries: LibraryEntry[], columns: number): LibraryItem[] {
  const rows: LibraryItem[] = [];
  for (let start = 0; start < entries.length; start += columns) {
    rows.push({ key: `tiles:${start / columns}`, type: 'tiles', entries: entries.slice(start, start + columns) });
  }
  return rows;
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
