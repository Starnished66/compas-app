import { LibraryFilter, QueuePage, Song } from '../data/types';
import { RemoteApi } from '../data/RemoteApi';
import { EntryTarget } from './LibraryEntryFactory';

export interface BulkSong {
  song: Song;
  catalogRevision?: string | null;
}

export type BulkCancelled = () => boolean;
const MAX_BULK_SONGS = 25_000;

export interface BulkWriteCounts { processed: number; succeeded: number; failed: number; stopped: boolean; error?: unknown }

/** Execute writes serially, stopping as soon as the owner is cancelled or a write fails. */
export async function runSerialBulkWrites<T>(
  items: readonly T[],
  cancelled: BulkCancelled,
  write: (item: T) => Promise<void>,
  onProgress?: (counts: BulkWriteCounts) => void,
): Promise<BulkWriteCounts> {
  const counts: BulkWriteCounts = { processed: 0, succeeded: 0, failed: 0, stopped: false };
  for (const item of items) {
    if (cancelled()) { counts.stopped = true; break; }
    try {
      await write(item);
      counts.succeeded++;
    } catch (error) {
      // A cooperative stop can happen while an awaited preflight is in flight.
      // In that case the item was never necessarily sent, so don't claim it
      // failed or processed. Callers that sent a mutation retain their own
      // in-flight/unknown-result message.
      if (cancelled()) {
        counts.stopped = true;
        break;
      }
      counts.failed++;
      counts.error = error;
      counts.processed++;
      counts.stopped = true;
      onProgress?.(counts);
      break;
    }
    counts.processed++;
    onProgress?.(counts);
    if (cancelled()) { counts.stopped = true; break; }
  }
  return counts;
}

export async function runPlaylistCreationJob<T>(
  create: () => Promise<void>,
  items: readonly T[],
  cancelled: BulkCancelled,
  append: (item: T) => Promise<void>,
  onProgress?: (counts: BulkWriteCounts) => void,
): Promise<{ created: boolean; counts: BulkWriteCounts; error?: unknown }> {
  const empty: BulkWriteCounts = { processed: 0, succeeded: 0, failed: 0, stopped: false };
  if (cancelled()) return { created: false, counts: { ...empty, stopped: true } };
  try { await create(); }
  catch (error) { return { created: false, counts: { ...empty, stopped: true, error }, error }; }
  if (cancelled()) return { created: true, counts: { ...empty, stopped: true } };
  return { created: true, counts: await runSerialBulkWrites(items, cancelled, append, onProgress) };
}

export function queueRemovalMatches(before: readonly Song[], after: readonly Song[], removedOffset: number): boolean {
  if (after.length !== before.length - 1 || removedOffset < 0 || removedOffset >= before.length) return false;
  const prefixMatches = new Array<boolean>(before.length + 1).fill(true);
  const suffixMatches = new Array<boolean>(before.length + 1).fill(true);
  for (let offset = 0; offset < after.length; offset++) {
    prefixMatches[offset + 1] = prefixMatches[offset] && before[offset].index === after[offset].index;
  }
  for (let offset = before.length - 1; offset > 0; offset--) {
    const afterOffset = offset - 1;
    suffixMatches[offset] = suffixMatches[offset + 1] && before[offset].index === after[afterOffset].index;
  }
  let candidates = 0;
  for (let candidate = 0; candidate < before.length; candidate++) {
    if (prefixMatches[candidate] && suffixMatches[candidate + 1]) candidates++;
  }
  return candidates === 1 && prefixMatches[removedOffset] && suffixMatches[removedOffset + 1];
}

export function queueRemovalAmbiguousAt(songs: readonly Song[], offset: number): boolean {
  const target = songs[offset]?.index;
  return target == null || target <= 0 || songs[offset - 1]?.index === target || songs[offset + 1]?.index === target;
}

/** Return every position where the new song could have been inserted. */
export function queueInsertionOffsets(before: readonly Song[], after: readonly Song[], addedIndex: number): number[] {
  if (after.length !== before.length + 1) return [];
  const prefixMatches = new Array<boolean>(before.length + 1).fill(true);
  const suffixMatches = new Array<boolean>(before.length + 1).fill(true);
  for (let offset = 0; offset < before.length; offset++) {
    prefixMatches[offset + 1] = prefixMatches[offset] && before[offset].index === after[offset].index;
  }
  for (let offset = before.length - 1; offset >= 0; offset--) {
    suffixMatches[offset] = suffixMatches[offset + 1] && before[offset].index === after[offset + 1].index;
  }
  const candidates: number[] = [];
  for (let offset = 0; offset <= before.length; offset++) {
    if (after[offset]?.index === addedIndex && prefixMatches[offset] && suffixMatches[offset]) candidates.push(offset);
  }
  return candidates;
}

export function queueInsertWindowMatches(
  before: readonly Song[], cursor: number, addedIndex: number, afterPage: readonly Song[], pageOffset: number,
): boolean {
  if (cursor < 0 || cursor > before.length) return false;
  const expected = [...before];
  expected.splice(cursor, 0, { index: addedIndex, title: '', artist: '', album: '' });
  const start = Math.max(0, cursor - 1);
  const end = Math.min(expected.length, cursor + 2);
  return pageOffset === start && afterPage.length >= end - start &&
    expected.slice(start, end).every((song, offset) => song.index === afterPage[offset]?.index);
}

export async function waitForQueueTransition(
  before: { revision: number; total: number; songs: Song[] },
  expectedRevision: number,
  matches: (after: { revision: number; total: number; songs: Song[]; offset?: number }) => boolean,
  read: () => Promise<{ revision: number; total: number; songs: Song[]; offset?: number }>,
  cancelled: BulkCancelled = () => false,
  wait: () => Promise<void> = () => new Promise((resolve) => setTimeout(resolve, 150)),
  attempts = 15,
): Promise<{ revision: number; total: number; songs: Song[] } | null> {
  for (let attempt = 0; attempt < attempts && !cancelled(); attempt++) {
    await wait();
    if (cancelled()) return null;
    const after = await read();
    if (cancelled()) return null;
    if (after.revision === before.revision) continue;
    if (after.revision !== expectedRevision || !matches(after)) throw new Error('Queue changed unexpectedly.');
    return after;
  }
  return null;
}

export async function readQueueSnapshot(
  queue: (offset: number, limit: number) => Promise<QueuePage>,
  cancelled: BulkCancelled = () => false,
): Promise<{ revision: number; total: number; songs: Song[] }> {
  const first = await queue(0, 25);
  if (cancelled()) throw new Error('Queue read cancelled');
  if (!Number.isSafeInteger(first.total) || first.total < 0) throw new Error('Queue count is invalid.');
  if (first.offset !== 0 || first.songs.length > 25) throw new Error('Could not read a complete queue snapshot.');
  if (first.songs.length > first.total || (first.total > 0 && first.songs.length === 0)) throw new Error('Could not read a complete queue snapshot.');
  const songs = [...first.songs];
  let offset = first.songs.length;
  while (offset < first.total) {
    if (cancelled()) throw new Error('Queue read cancelled');
    const page = await queue(offset, 25);
    if (page.revision !== first.revision || page.total !== first.total || page.offset !== offset || page.songs.length > 25) throw new Error('Queue changed while reading.');
    if (page.songs.length === 0 || offset + page.songs.length <= offset) throw new Error('Queue page did not advance.');
    songs.push(...page.songs);
    offset += page.songs.length;
  }
  if (songs.length !== first.total) throw new Error('Could not read a complete queue snapshot.');
  if (songs.some((song) => !Number.isSafeInteger(song.index) || song.index <= 0)) throw new Error('Queue contains a track that cannot be identified safely.');
  return { revision: first.revision, total: first.total, songs };
}

/** Resolve selected collections a page at a time and dedupe by stable player song ID. */
export async function resolveBulkSongs(
  api: RemoteApi,
  targets: readonly EntryTarget[],
  cancelled: BulkCancelled = () => false,
): Promise<BulkSong[]> {
  const songs: BulkSong[] = [];
  const seen = new Set<number>();
  const append = (page: readonly Song[], catalogRevision?: string | null) => {
    for (const song of page) {
      if (!Number.isSafeInteger(song.index) || song.index < 1 || seen.has(song.index)) continue;
      if (seen.size >= MAX_BULK_SONGS) throw new Error(`Bulk actions are limited to ${MAX_BULK_SONGS.toLocaleString()} songs at a time.`);
      seen.add(song.index);
      songs.push({ song, catalogRevision });
    }
  };

  for (const target of targets) {
    if (cancelled()) break;
    if (target.type === 'Song') {
      append([target.song], target.catalogRevision);
      continue;
    }

    if (target.type === 'Playlist') {
      let offset = 0;
      let revision: string | null = null;
      while (!cancelled()) {
        const page = await api.playlistPage(target.playlist.key, offset);
        if (revision && page.revision && revision !== page.revision) throw new Error(`Playlist changed while reading “${target.playlist.name}”`);
        revision = page.revision;
        append(page.songs);
        if (page.nextOffset <= offset || page.nextOffset >= page.total) break;
        offset = page.nextOffset;
      }
      continue;
    }

    let filter: LibraryFilter | null = null;
    if (target.type === 'Album') {
      filter = {
        album: target.group.name,
        ...(target.group.albumArtist ? { albumArtist: target.group.albumArtist } : {}),
        ...(target.context?.kind === 'artist' ? { artist: target.context.name } : {}),
        ...(target.context?.kind === 'albumArtist' ? { albumArtist: target.context.name } : {}),
      };
      if (filter.artist && filter.albumArtist) delete filter.albumArtist;
    } else if (target.type === 'Group' && target.kind === 'artist') {
      filter = { artist: target.group.name };
    } else if (target.type === 'Group' && target.kind === 'albumArtist') {
      filter = { albumArtist: target.group.name };
    } else if (target.type === 'Group' && target.kind === 'genre') {
      filter = { genre: target.group.name };
    }
    if (!filter) continue;

    let offset = 0;
    while (!cancelled()) {
      const page = await api.library(offset, 100, null, filter);
      append(page.songs);
      const nextOffset = offset + page.songs.length;
      if (page.songs.length === 0 || nextOffset <= offset || nextOffset >= page.total) break;
      offset = nextOffset;
    }
  }
  return songs;
}
