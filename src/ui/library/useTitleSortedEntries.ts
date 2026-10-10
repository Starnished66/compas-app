import { useMemo, useRef } from 'react';
import { TitledEntry, resortByTitle } from './titleSort';

export function useTitleSortedEntries<T extends TitledEntry>(entries: T[], enabled: boolean, ascending: boolean): T[] {
  const previous = useRef<{ source: T[]; sorted: T[] } | null>(null);

  const sorted = useMemo(() => {
    if (!enabled) return entries;
    const next = resortByTitle(entries, previous.current);
    previous.current = { source: entries, sorted: next };
    return next;
  }, [entries, enabled]);

  return useMemo(() => (enabled && !ascending ? [...sorted].reverse() : sorted), [sorted, enabled, ascending]);
}
