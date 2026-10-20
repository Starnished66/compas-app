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
