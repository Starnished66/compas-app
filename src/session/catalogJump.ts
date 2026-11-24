import type { CatalogGroup } from '../data/SyncedCatalogStore';
import type { LibraryGroup } from '../data/types';

export interface AlbumLookupTarget {
  album: string;
  title?: string | null;
  artist?: string | null;
  albumArtist?: string | null;
  albumKey?: string | null;
  songId?: number | null;
}

/** Picks the uniquely matching album group from synced catalog candidates, or null when ambiguous/missing. */
export function resolveAlbumGroup(
  candidates: readonly CatalogGroup[],
  target: AlbumLookupTarget,
): LibraryGroup | null {
  const wantedAlbum = target.album.trim().toLocaleLowerCase();
  const wantedAlbumArtist = (target.albumArtist || '').trim().toLocaleLowerCase();

  const toGroup = (matched: CatalogGroup): LibraryGroup => ({
    name: matched.name,
    count: matched.count,
    index: matched.index,
    albumArtist: matched.albumArtist,
    albumKey: matched.albumKey ?? null,
  });

  if (target.albumKey) {
    const byKey = candidates.find((g) => g.albumKey && g.albumKey === target.albumKey);
    return byKey ? toGroup(byKey) : null;
  }

  const exactAlbum = candidates.filter((g) => g.name.trim().toLocaleLowerCase() === wantedAlbum);
  if (exactAlbum.length === 0) return null;
  if (exactAlbum.length === 1) return toGroup(exactAlbum[0]);

  if (wantedAlbumArtist) {
    const byAlbumArtist = exactAlbum.filter((g) => g.albumArtist.trim().toLocaleLowerCase() === wantedAlbumArtist);
    if (byAlbumArtist.length === 1) return toGroup(byAlbumArtist[0]);
  }
  return null;
}
