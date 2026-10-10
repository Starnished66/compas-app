const titleCollator = new Intl.Collator(undefined, { sensitivity: 'base' });

export interface TitledEntry {
  id: string;
  title: string;
}

export function sortByTitle<T extends TitledEntry>(entries: T[]): T[] {
  return [...entries].sort((a, b) => titleCollator.compare(a.title, b.title));
}

export function hasSameTitles(previous: TitledEntry[], next: TitledEntry[]): boolean {
  if (previous.length !== next.length) return false;
  return previous.every((entry, index) => entry.id === next[index].id && entry.title === next[index].title);
}

export function inSameOrder<T extends TitledEntry>(sorted: TitledEntry[], entries: T[]): T[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  return sorted.map((entry) => byId.get(entry.id)!);
}

export function resortByTitle<T extends TitledEntry>(
  entries: T[],
  previous: { source: TitledEntry[]; sorted: TitledEntry[] } | null,
): T[] {
  return previous && hasSameTitles(previous.source, entries) ? inSameOrder(previous.sorted, entries) : sortByTitle(entries);
}
