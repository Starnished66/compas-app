import { useCallback, useSyncExternalStore } from 'react';
import { LibraryEntry } from '../../data/types';
import { useLibraryArtworkStore } from './libraryArtworkContext';

const unsubscribed = () => {};

export function useEntryArtwork(entry?: LibraryEntry | null): string | null | undefined {
  const store = useLibraryArtworkStore();
  const entryId = entry?.id;
  const subscribe = useCallback(
    (listener: () => void) => (entryId ? store.subscribeToEntry(entryId, listener) : unsubscribed),
    [store, entryId],
  );
  const stored = useSyncExternalStore(subscribe, () => (entryId ? store.get(entryId) : undefined));
  return stored ?? entry?.artwork;
}
