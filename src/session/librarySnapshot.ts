import type { ContentStatus, LibraryCategory, LibraryEntry, LibraryFilter, PlayContext, Playlist } from '../data/types';
import type { CatalogIdentity } from '../data/SyncedCatalogStore';
import type { AlbumBrowseIdentity } from './albumBrowseIdentity';
import type { LibraryContext } from './LibraryEntryFactory';
import type { ExtensionPage } from './LibraryListCache';

export interface LibrarySnapshot {
  sortEpoch: number;
  catalog: CatalogIdentity | null;
  category: LibraryCategory;
  entries: LibraryEntry[];
  query: string;
  status: ContentStatus;
  countLabel?: string | null;
  hasMore: boolean;
  isNested: boolean;
  nestedTitle?: string | null;
  context: LibraryContext | null;
  total: number;
  page: { filter: LibraryFilter; playContext: PlayContext; albumKey: string | null; albumIdentity?: AlbumBrowseIdentity } | null;
  extensionPage: ExtensionPage | null;
  listKey: string | null;
  activePlaylist: Playlist | null;
  playlistRevision: string | null;
  folderPath: string;
  folderRoot: string;
}

export function sameCatalogRevision(a: CatalogIdentity | null, b: CatalogIdentity | null): boolean {
  return a?.libraryId === b?.libraryId && a?.revision === b?.revision;
}
