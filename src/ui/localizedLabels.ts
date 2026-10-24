import type { LibraryEntry } from '../data/types';
import { localizedCountLabel } from './countLabels';
import { displaySubtitle } from './library/libraryEntryKind';

type Translate = (source: string, variables?: Record<string, string | number>) => string;

/** Translate known library count labels at the display edge, preserving names and unknown text. */
export { localizedCountLabel };

/** Translate metadata only when its producer explicitly marks it as a UI label. */
export function localizedEntrySubtitle(entry: LibraryEntry, t: Translate): string {
  const translation = entry.subtitleTranslation;
  return translation ? t(translation.source, translation.values) : displaySubtitle(entry);
}

const DYNAMIC_MESSAGES: ReadonlyArray<{ pattern: RegExp; source: string; names: string[] }> = [
  { pattern: /^Too many PIN attempts\. Try again in (\d+)s\.$/, source: 'Too many PIN attempts. Try again in {seconds}s.', names: ['seconds'] },
  { pattern: /^Tap Pair beside (.+), approve Android's prompt, then try again\.$/, source: 'Tap Pair beside {name}, approve Android’s prompt, then try again.', names: ['name'] },
  { pattern: /^Bulk actions are limited to (.+) songs at a time\.$/, source: 'Bulk actions are limited to {count} songs at a time.', names: ['count'] },
  { pattern: /^Playlist changed while reading “(.+)”$/, source: 'Playlist changed while reading “{name}”', names: ['name'] },
];

/** Translate a session message, including the few that embed a value, leaving unknown text readable. */
export function localizedMessage(message: string, t: Translate): string {
  for (const { pattern, source, names } of DYNAMIC_MESSAGES) {
    const match = pattern.exec(message);
    if (match) return t(source, Object.fromEntries(names.map((name, index) => [name, match[index + 1]])));
  }
  return t(message);
}
