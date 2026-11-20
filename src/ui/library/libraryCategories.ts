import { LibraryCategory } from '../../data/types';

export interface LibraryCategoryOption {
  value: LibraryCategory;
  label: string;
  noun: string;
  feature?: string;
}

const favorites = {
  label: 'Favorites',
  noun: 'favorites',
  empty: { title: 'No favorites yet', body: 'Tap the heart on Now Playing or in a song’s menu.' },
};
const topRated = {
  label: 'Top rated',
  noun: 'top rated tracks',
  empty: { title: 'No songs rated 3 stars or higher yet' },
};

export function favoritesLabels(features: Iterable<string>) {
  for (const feature of features) {
    if (feature === 'ratings_edit') return topRated;
  }
  return favorites;
}

const BUILT_IN_PLAYLIST_LABELS: Record<string, string> = {
  '@most_played': 'Most played',
  '@recently_played': 'Recently played',
};

// The player names its own playlists in English; show them in the app's language.
export function builtInPlaylistLabel(key: string | undefined, features: Iterable<string>): string | undefined {
  return key === '@favorites' ? favoritesLabels(features).label : key ? BUILT_IN_PLAYLIST_LABELS[key] : undefined;
}

export const LIBRARY_CATEGORY_OPTIONS: LibraryCategoryOption[] = [
  { value: LibraryCategory.Albums, label: 'Albums', noun: 'albums' },
  { value: LibraryCategory.Artists, label: 'Artists', noun: 'artists' },
  { value: LibraryCategory.AlbumArtists, label: 'Album artists', noun: 'album artists' },
  { value: LibraryCategory.Songs, label: 'Songs', noun: 'songs' },
  { value: LibraryCategory.Genres, label: 'Genres', noun: 'genres' },
  { value: LibraryCategory.Favorites, label: favorites.label, noun: favorites.noun, feature: 'favorites_edit' },
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
  const { label, noun } = favoritesLabels(supportedFeatures);
  return LIBRARY_CATEGORY_OPTIONS
    .filter((option) => !option.feature || supportedFeatures.includes(option.feature))
    .map((option) => option.value === LibraryCategory.Favorites ? { ...option, label, noun } : option);
}

export function categoryNoun(category: LibraryCategory, supportedFeatures: string[]): string {
  if (category === LibraryCategory.Favorites) return favoritesLabels(supportedFeatures).noun;
  return LIBRARY_CATEGORY_OPTIONS.find((option) => option.value === category)?.noun ?? category.toLowerCase();
}

export function isSortableCategory(category: LibraryCategory): boolean {
  return SORTABLE_CATEGORIES.has(category);
}
