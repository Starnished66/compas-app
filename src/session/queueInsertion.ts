import { QueuePage } from '../data/types';

export const QUEUE_PROBE_SIZE = 25;

export interface QueueEnds {
  total: number;
  head: number[];
  tail: number[];
}

/** The song indexes at both ends of Up next; enough to tell where a single added song landed. */
export function queueEnds(head: QueuePage, tail: QueuePage | null): QueueEnds {
  return {
    total: head.total,
    head: head.songs.map((song) => song.index),
    tail: (tail ?? head).songs.map((song) => song.index),
  };
}

/**
 * Where one added song landed in Up next, or null when that can't be told from the two ends.
 * Players don't all append: one inserts after the songs already queued ahead, so the new song
 * is found by the first difference at the head, or as the new last song at the tail. The song
 * may already be elsewhere in the queue, so matching its index alone isn't enough.
 */
export function insertedOffset(before: QueueEnds, after: QueueEnds, songIndex: number): number | null {
  if (after.total !== before.total + 1) return null;
  for (let i = 0; i < after.head.length; i++) {
    if (after.head[i] === before.head[i]) continue;
    return after.head[i] === songIndex && after.head[i + 1] === before.head[i] ? i : null;
  }
  const last = after.tail[after.tail.length - 1];
  const previousLast = before.tail[before.tail.length - 1];
  if (last === songIndex && after.tail[after.tail.length - 2] === previousLast) return after.total - 1;
  return null;
}
