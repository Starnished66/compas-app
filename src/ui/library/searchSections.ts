import { LibraryCategory, LibraryEntry } from '../../data/types';
import { LibraryEntryKind, libraryEntryKind } from './libraryEntryKind';

export type SearchFilter = 'all' | 'artists' | 'albums' | 'songs' | 'genres';

export interface SearchSection {
  filter: Exclude<SearchFilter, 'all'>;
  label: string;
  entries: LibraryEntry[];
  total: number;
}

const SECTION_DEFINITIONS: { filter: SearchSection['filter']; kind: LibraryEntryKind; label: string; preview: number }[] = [
  { filter: 'artists', kind: 'artist', label: 'Artists', preview: 3 },
  { filter: 'albums', kind: 'album', label: 'Albums', preview: 3 },
  { filter: 'songs', kind: 'song', label: 'Songs', preview: 5 },
  { filter: 'genres', kind: 'genre', label: 'Genres', preview: 3 },
];

export const SEARCH_FILTER_OPTIONS: { value: SearchFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  ...SECTION_DEFINITIONS.map((definition) => ({ value: definition.filter, label: definition.label })),
];

export function searchSections(entries: LibraryEntry[], filter: SearchFilter): SearchSection[] {
  const context = { category: LibraryCategory.Search, isNested: false };
  return SECTION_DEFINITIONS.filter((definition) => filter === 'all' || filter === definition.filter)
    .map((definition) => {
      const matching = entries.filter((entry) => libraryEntryKind(entry, context) === definition.kind);
      return {
        filter: definition.filter,
        label: definition.label,
        entries: filter === 'all' ? matching.slice(0, definition.preview) : matching,
        total: matching.length,
      };
    })
    .filter((section) => section.total > 0);
}
