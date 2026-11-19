import type { RemoteApi } from '../data/RemoteApi';
import type { LibraryEntry } from '../data/types';
import type { LibraryContext, LibraryEntryFactory } from './LibraryEntryFactory';
import type { ExtensionPage, LibraryList, OrderedAlbumCursor } from './LibraryListCache';

const ALBUM_PAGE_SIZE = 25;

export function albumGroupFilter(context: LibraryContext) {
  return context.kind === 'artist' ? { artist: context.name } : { albumArtist: context.name };
}

export async function readOrderedAlbumPage(api: RemoteApi, context: LibraryContext | null, offset = 0) {
  const scope = context?.kind === 'artist' ? 'artists' : context ? 'album_artists' : 'albums';
  const filter = context ? albumGroupFilter(context) : {};
  const page = await api.libraryAlbumGroups({ scope, ...filter, offset, limit: ALBUM_PAGE_SIZE });
  if (
    page.offset !== offset ||
    page.nextOffset > page.total ||
    page.nextOffset !== offset + page.groups.length ||
    (offset < page.total && page.nextOffset <= offset)
  ) throw new Error('Invalid ordered album group page');
  return page;
}

export function orderedAlbumList(
  factory: LibraryEntryFactory,
  context: LibraryContext | null,
  page: Awaited<ReturnType<typeof readOrderedAlbumPage>>,
  shown: LibraryEntry[] = [],
): LibraryList {
  const { total, revision, nextOffset } = page;
  const hasMore = nextOffset < total;
  if (context && !hasMore) {
    const pageTracks = page.groups.reduce((count, group) => count + group.count, 0);
    const trackCount = shown.reduce((count, entry) => {
      const target = factory.target(entry.id);
      return count + (target?.type === 'Album' ? target.group.count : 0);
    }, pageTracks);
    factory.saveOrderedGroupTrackCount(context, revision, trackCount);
  }
  const added = factory.albums(page.groups, context, shown);
  const extensionPage: OrderedAlbumCursor = { kind: 'orderedAlbums', context, revision, nextOffset, total };
  return {
    entries: shown.length ? [...shown, ...added] : added,
    total,
    label: orderedAlbumCountLabel(factory, extensionPage),
    hasMore,
    extensionPage,
  };
}

function orderedAlbumCountLabel(factory: LibraryEntryFactory, cursor: OrderedAlbumCursor): string {
  const saved = cursor.context && factory.orderedGroupTrackCount(cursor.context);
  const albums = `${cursor.total} albums`;
  return saved && saved.revision === cursor.revision ? `${albums} · ${saved.count} tracks` : albums;
}

/** Page one of the root Rating list when its revision moved on from `previous`, else null. */
export async function readChangedRatingAlbums(api: RemoteApi, previous: ExtensionPage | null | undefined) {
  if (previous?.kind !== 'orderedAlbums' || previous.context) return null;
  try {
    const page = await readOrderedAlbumPage(api, null);
    return page.revision === previous.revision ? null : page;
  } catch {
    return null; // Keep the shown list when this optional read fails.
  }
}

export function pageRevision(page: ExtensionPage | null | undefined): string | null {
  return page?.kind === 'orderedAlbums' ? page.revision : null;
}

export async function readMoreOrderedAlbums(
  api: RemoteApi,
  cursor: OrderedAlbumCursor,
  ownsView: () => boolean,
) {
  if (!ownsView()) return null;
  const { context } = cursor;
  let page;
  try {
    page = await readOrderedAlbumPage(api, context, cursor.nextOffset);
  } catch (error: any) {
    // The previous offset can become invalid when the library shrinks.
    if (error?.statusCode !== 409 &&
        !(error?.statusCode === 400 && error.responseBody?.includes('"invalid_offset"'))) throw error;
  }
  if (!ownsView()) return null;
  if (page?.revision === cursor.revision) {
    if (page.total !== cursor.total) throw new Error('Invalid ordered album group page');
    return page;
  }
  const first = await readOrderedAlbumPage(api, context);
  return ownsView() ? first : null;
}
