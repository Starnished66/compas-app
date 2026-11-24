import type { LibraryEntry } from '../data/types';
import { loadCatalog } from '../i18n/catalogs';
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
  // Phone folder errors from the native file module; the name can be anything, a final dot included.
  { pattern: /^(.+) is not available$/, source: '{name} is not available', names: ['name'] },
  { pattern: /^(.+) is not a folder$/, source: '{name} is not a folder', names: ['name'] },
  { pattern: /^Could not read (.+)$/, source: 'Could not read {name}', names: ['name'] },
  { pattern: /^Choose fewer than (\d+) files at once$/, source: 'Choose fewer than {count} files at once', names: ['count'] },
];

/** Translate a session message, including the few that embed a value, leaving unknown text readable. */
/**
 * Whether `message` is an exact catalog source string. en.ts holds only some sources; every source has a Spanish entry
 * (check:translations requires full coverage), so either catalog answers.
 */
function isCatalogMessage(message: string): boolean {
  const has = (language: 'en' | 'es') => Object.prototype.hasOwnProperty.call(loadCatalog(language), message);
  return has('en') || has('es');
}

/** Whether the app has a translation for this message, exactly or as one of the templates above. */
export function isLocalizableMessage(message: string): boolean {
  return isCatalogMessage(message) || DYNAMIC_MESSAGES.some(({ pattern }) => pattern.test(message));
}

export function localizedMessage(message: string, t: Translate): string {
  // An exact catalog message such as "Could not read the SD card." wins over a template that would also match it.
  if (isCatalogMessage(message)) return t(message);
  for (const { pattern, source, names } of DYNAMIC_MESSAGES) {
    const match = pattern.exec(message);
    if (match) return t(source, Object.fromEntries(names.map((name, index) => [name, match[index + 1]])));
  }
  return t(message);
}
