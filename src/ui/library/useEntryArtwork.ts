import { useCallback, useContext, useSyncExternalStore } from 'react';
import { LibraryEntry } from '../../data/types';
import { useLibraryArtworkStore } from './libraryArtworkContext';
import { VisibleLibraryArtworkContext } from './visibleLibraryArtwork';

const unsubscribed = () => {};

export function useEntryArtwork(entry?: LibraryEntry | null): string | null | undefined {
  const store = useLibraryArtworkStore();
  const visibleArtwork = useContext(VisibleLibraryArtworkContext);
  const entryId = entry?.id;
  const subscribe = useCallback((listener: () => void) => {
    if (!entryId) return unsubscribed;
    const unsubscribeEntry = store.subscribeToEntry(entryId, listener);
    const unsubscribeVisible = visibleArtwork?.subscribe(listener);
    return () => {
      unsubscribeEntry();
      unsubscribeVisible?.();
    };
  }, [store, entryId, visibleArtwork]);
  return useSyncExternalStore(subscribe, () =>
    entry ? visibleArtwork?.get(entry) ?? store.getEntryArtwork(entry) : undefined);
}
