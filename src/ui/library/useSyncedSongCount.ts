import { useRef } from 'react';
import { syncedSongTotal } from './librarySync';

export function useSyncedSongCount(message: string | null | undefined): number | null {
  const lastTotal = useRef<number | null>(null);
  const total = syncedSongTotal(message);
  if (total != null) lastTotal.current = total;
  return lastTotal.current;
}
