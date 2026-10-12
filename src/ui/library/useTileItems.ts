import { useMemo, useRef } from 'react';
import { LibraryEntry } from '../../data/types';
import { LibraryItem, tileItems } from './libraryItems';

const NO_ROWS: LibraryItem[] = [];

export function useTileItems(entries: LibraryEntry[], columns: number, enabled: boolean): LibraryItem[] {
  const previous = useRef<LibraryItem[]>(NO_ROWS);
  return useMemo(() => {
    if (!enabled) return NO_ROWS;
    const rows = tileItems(entries, columns, previous.current);
    previous.current = rows;
    return rows;
  }, [entries, columns, enabled]);
}
