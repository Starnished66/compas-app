import { LibraryEntry } from '../data/types';

function sameEntry(a: LibraryEntry, b: LibraryEntry): boolean {
  return (
    a.id === b.id &&
    a.title === b.title &&
    a.subtitle === b.subtitle &&
    a.artwork === b.artwork &&
    a.kind === b.kind &&
    a.favorite === b.favorite &&
    a.playlistKey === b.playlistKey &&
    a.writable === b.writable &&
    a.playlistPosition === b.playlistPosition
  );
}

export function reconcileEntries(previous: LibraryEntry[], next: LibraryEntry[]): LibraryEntry[] {
  if (!previous.length) return next;
  const previousById = new Map(previous.map((entry) => [entry.id, entry]));
  let unchanged = previous.length === next.length;
  const reconciled = next.map((entry, index) => {
    const match = previousById.get(entry.id);
    const kept = match && sameEntry(match, entry) ? match : entry;
    if (kept !== previous[index]) unchanged = false;
    return kept;
  });
  return unchanged ? previous : reconciled;
}
