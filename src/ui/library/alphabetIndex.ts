import { LibraryEntry } from '../../data/types';
import { LibraryItem } from './libraryItems';

export const NON_LETTER_KEY = '#';

export function letterOfTitle(title: string): string {
  const first = title.trim().normalize('NFD').replace(/[̀-ͯ]/g, '').charAt(0);
  return /[a-z]/i.test(first) ? first.toUpperCase() : NON_LETTER_KEY;
}

export function letterOfEntry(entry: LibraryEntry): string {
  return letterOfTitle(entry.title);
}

export interface RailLetter {
  letter: string;
  itemIndex: number;
}

export function railLetters(items: LibraryItem[]): RailLetter[] {
  const seen = new Map<string, number>();
  items.forEach((item, index) => {
    if (item.type === 'letter' && !seen.has(item.letter)) seen.set(item.letter, index);
  });
  return [...seen.entries()]
    .map(([letter, itemIndex]) => ({ letter, itemIndex }))
    .sort((a, b) => {
      if (a.letter === NON_LETTER_KEY) return -1;
      if (b.letter === NON_LETTER_KEY) return 1;
      return a.letter.localeCompare(b.letter);
    });
}
