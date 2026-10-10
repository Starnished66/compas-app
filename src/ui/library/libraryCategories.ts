import { LibraryCategory } from '../../data/types';

export interface LibraryCategoryOption {
  value: LibraryCategory;
  label: string;
  noun: string;
  feature?: string;
}

export const LIBRARY_CATEGORY_OPTIONS: LibraryCategoryOption[] = [
  { value: LibraryCategory.Albums, label: 'Albums', noun: 'albums' },
  { value: LibraryCategory.Artists, label: 'Artists', noun: 'artists' },
  { value: LibraryCategory.AlbumArtists, label: 'Album artists', noun: 'album artists' },
  { value: LibraryCategory.Songs, label: 'Songs', noun: 'songs' },
  { value: LibraryCategory.Genres, label: 'Genres', noun: 'genres' },
  { value: LibraryCategory.Favorites, label: 'Favorites', noun: 'favorites', feature: 'favorites_edit' },
  { value: LibraryCategory.Recent, label: 'Recently played', noun: 'recently played songs', feature: 'recently_played' },
  { value: LibraryCategory.Folders, label: 'Folders', noun: 'folders', feature: 'folder_browse' },
];

const SORTABLE_CATEGORIES = new Set<LibraryCategory>([
  LibraryCategory.Albums,
  LibraryCategory.Artists,
  LibraryCategory.AlbumArtists,
  LibraryCategory.Genres,
]);

export function availableCategoryOptions(supportedFeatures: string[]): LibraryCategoryOption[] {
  return LIBRARY_CATEGORY_OPTIONS.filter((option) => !option.feature || supportedFeatures.includes(option.feature));
}

export function categoryNoun(category: LibraryCategory): string {
  return LIBRARY_CATEGORY_OPTIONS.find((option) => option.value === category)?.noun ?? category.toLowerCase();
}

export function isSortableCategory(category: LibraryCategory): boolean {
  return SORTABLE_CATEGORIES.has(category);
}
