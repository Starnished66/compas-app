import { LibraryGroup } from '../data/types';
import { RemoteApi } from '../data/RemoteApi';

export type LibrarySortScope = 'albums' | 'artists' | 'album_artists';

export interface AlbumGroupFilter {
  artist?: string | null;
  albumArtist?: string | null;
}

const ALBUM_GROUP_PAGE_SIZE = 100;

/** Reads only ordered group rows from the player, preserving its index order. */
export async function loadServerOrderedAlbumGroups(
  api: RemoteApi,
  scope: LibrarySortScope,
  filter: AlbumGroupFilter = {},
): Promise<LibraryGroup[]> {
  const groups: LibraryGroup[] = [];
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;
  let revision: string | null = null;

  while (offset < total) {
    const page = await api.libraryAlbumGroups({
      scope,
      ...filter,
      offset,
      limit: ALBUM_GROUP_PAGE_SIZE,
    });
    if (
      page.offset !== offset ||
      !Number.isSafeInteger(page.total) ||
      page.total < 0 ||
      typeof page.revision !== 'string' ||
      page.revision.length === 0 ||
      !Number.isSafeInteger(page.nextOffset) ||
      (offset < page.total && page.nextOffset <= offset) ||
      page.nextOffset > page.total ||
      page.nextOffset !== offset + page.groups.length ||
      (offset > 0 && (page.total !== total || page.revision !== revision))
    ) {
      throw new Error('Invalid ordered album group page');
    }
    groups.push(...page.groups);
    revision = page.revision;
    total = page.total;
    offset = page.nextOffset;
  }

  return groups;
}
