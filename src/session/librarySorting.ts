import { expectedLibrarySortReverse, LIBRARY_SORT_SECTIONS } from '../data/librarySortModes';
import type { LibrarySortMode, LibrarySortScope, LibrarySortSnapshot, LibrarySortingSnapshot } from '../data/types';
import type { RemoteApi } from '../data/RemoteApi';

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
