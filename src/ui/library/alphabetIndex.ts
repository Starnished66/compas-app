import { LibraryEntry } from '../../data/types';
import { isIgnorableLeading } from '../../session/titleOrder';
import { LibraryItem } from './libraryItems';

export const NON_LETTER_KEY = '#';
/** Symbols and scripts without letter case (CJK, Arabic, Hebrew…) share one section after Z. */
export const OTHER_SCRIPT_KEY = '…';

// Sections follow the player's browse collation (see isIgnorableLeading).
// Latin letters whose decomposition is not a base letter plus accents.
const LATIN_LETTERS: Record<string, string> = {
  Æ: 'A', æ: 'A', Œ: 'O', œ: 'O', ß: 'S', ẞ: 'S', Þ: 'T', þ: 'T', Ð: 'D', ð: 'D', Đ: 'D', đ: 'D',
  Ø: 'O', ø: 'O', Ł: 'L', ł: 'L', Ħ: 'H', ħ: 'H', Ŧ: 'T', ŧ: 'T', Ŀ: 'L', ŀ: 'L', ı: 'I', Ĳ: 'I', ĳ: 'I',
};

export function letterOfTitle(title: string): string {
  let first = '';
  for (const char of title.normalize('NFD')) {
    const code = char.codePointAt(0)!;
    if (code >= 0x0300 && code <= 0x036f) continue;
    if (isIgnorableLeading(code)) continue;
    first = char;
    break;
  }
  // Digits sort before A on the player; everything that is not Latin sorts after Z.
  if (!first || /[0-9]/.test(first)) return NON_LETTER_KEY;
  if (/[a-z]/i.test(first)) return first.toUpperCase();
  if (LATIN_LETTERS[first]) return LATIN_LETTERS[first];
  const upper = first.toUpperCase();
  return upper !== first.toLowerCase() ? upper : OTHER_SCRIPT_KEY;
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
  // The player's order puts digits first and other scripts last, so the rail follows the list.
  return [...seen.entries()]
    .map(([letter, itemIndex]) => ({ letter, itemIndex }))
    .sort((a, b) => a.itemIndex - b.itemIndex);
}
