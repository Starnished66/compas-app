import { LibraryCategory, LibraryEntry } from '../data/types';

export interface ExtensionPage {
  kind: 'folder' | 'recent' | 'playlist';
  nextOffset: number;
  total: number;
  root?: string;
  path?: string;
  key?: string;
}

export interface LibraryList {
  entries: LibraryEntry[];
  total: number;
  label: string;
  hasMore: boolean;
  extensionPage: ExtensionPage | null;
}

const PLAYER_EDITED_CATEGORIES = new Set<LibraryCategory>([
  LibraryCategory.Playlists,
  LibraryCategory.Favorites,
  LibraryCategory.Recent,
  LibraryCategory.Folders,
]);

export function isCacheableCategory(category: LibraryCategory): boolean {
  return category !== LibraryCategory.Search;
}

export function needsRevalidation(category: LibraryCategory): boolean {
  return PLAYER_EDITED_CATEGORIES.has(category);
}

export function libraryListKey(source: string, category: LibraryCategory): string {
  return `${source}\u0000${category}`;
}

export class LibraryListCache {
  private source: string | null = null;
  private readonly lists = new Map<LibraryCategory, LibraryList>();

  get(source: string, category: LibraryCategory): LibraryList | undefined {
    return source === this.source ? this.lists.get(category) : undefined;
  }

  set(source: string, category: LibraryCategory, list: LibraryList): void {
    if (!isCacheableCategory(category)) return;
    if (source !== this.source) {
      this.lists.clear();
      this.source = source;
    }
    this.lists.set(category, list);
  }

  clear(): void {
    this.lists.clear();
    this.source = null;
  }
}
