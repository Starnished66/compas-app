import { useSyncExternalStore } from 'react';
import { LibraryEntry } from '../../data/types';
import { useLibraryArtworkStore } from './libraryArtworkContext';

export function useFirstEntryArtwork(
  entries: readonly LibraryEntry[] | null,
  preferred?: LibraryEntry | null,
): string | undefined {
  const store = useLibraryArtworkStore();
  return useSyncExternalStore(store.subscribe, () => (entries ? store.firstArtwork(entries, preferred) : undefined));
}
