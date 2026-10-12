import { useMemo } from 'react';

export function useSortDirection<T>(entries: T[], descending: boolean): T[] {
  return useMemo(() => (descending ? [...entries].reverse() : entries), [entries, descending]);
}
