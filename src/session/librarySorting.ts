import { expectedLibrarySortReverse, LIBRARY_SORT_SECTIONS } from '../data/librarySortModes';
import type { LibraryGroup, LibrarySortMode, LibrarySortScope, LibrarySortSnapshot, LibrarySortingSnapshot } from '../data/types';
import type { RemoteApi } from '../data/RemoteApi';

export interface AlbumGroupFilter {
  artist?: string | null;
  albumArtist?: string | null;
}

const ALBUM_GROUP_PAGE_SIZE = 100;

export function isServerOrderedAlbumSort(sort: Pick<LibrarySortSnapshot, 'effective' | 'reverse'> | null | undefined): boolean {
  return sort != null && (sort.effective !== 0 || sort.reverse === true);
}

export async function requestLibrarySortChange(
  api: RemoteApi,
  current: LibrarySortingSnapshot,
  scope: LibrarySortScope,
  mode: LibrarySortMode,
  isCurrent: () => boolean,
): Promise<LibrarySortingSnapshot | undefined> {
  const { key } = LIBRARY_SORT_SECTIONS[scope];
  const previous = current[key];
  if (previous.effective === mode || previous.available[mode] !== true || !isCurrent()) return;

  const latest = await api.librarySorting();
  if (!isCurrent()) return;
  const device = latest[key];
  if (device.effective === mode || device.available[mode] !== true) return latest;

  const expectedReverse = expectedLibrarySortReverse(mode, device.reverse);
  await api.setLibrarySorting(scope, mode);
  for (let i = 0; i < 15 && isCurrent(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    if (!isCurrent()) return;
    const sorting = await api.librarySorting();
    if (!isCurrent()) return;
    const selected = sorting[key];
    if (selected.configured === mode && selected.reverse === expectedReverse) return sorting;
  }
  if (isCurrent()) throw new Error('The player has not confirmed the sorting change.');
}

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
