import { useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { LibraryEntry } from '../../data/types';
import type { DisplayedLibraryArtwork } from '../../session/LibraryArtworkStore';
import { useLibraryArtworkStore } from './libraryArtworkContext';

function useCollectionArtwork(
  entries: readonly LibraryEntry[] | null,
  scope: string | undefined,
  preferred?: LibraryEntry | null,
): DisplayedLibraryArtwork | undefined {
  const store = useLibraryArtworkStore();
  const retained = useRef<{ store: typeof store; scope: typeof scope; artwork?: DisplayedLibraryArtwork }>(undefined);
  const getSnapshot = useMemo(() => {
    let snapshot: DisplayedLibraryArtwork | undefined;
    return () => {
      const current = retained.current;
      const artwork = current?.store === store && current.scope === scope ? current.artwork : undefined;
      snapshot = entries ? store.firstArtwork(entries, preferred, artwork, snapshot) : undefined;
      return snapshot;
    };
  }, [store, scope, entries, preferred]);
  const artwork = useSyncExternalStore(store.subscribe, getSnapshot);
  useLayoutEffect(() => {
    retained.current = { store, scope, artwork };
  }, [store, scope, artwork]);
  return artwork;
}

export function useFirstEntryArtwork(
  entries: readonly LibraryEntry[] | null,
  preferred?: LibraryEntry | null,
): string | undefined {
  return useCollectionArtwork(entries, preferred?.id, preferred)?.uri;
}

export function usePlaylistArtwork(playlistKey: string | undefined, entries: readonly LibraryEntry[]): string | undefined {
  const store = useLibraryArtworkStore();
  const artwork = useCollectionArtwork(playlistKey ? entries : null, playlistKey);
  useEffect(() => {
    if (playlistKey && artwork) store.rememberPlaylistArtwork(playlistKey, artwork.reference);
  }, [store, playlistKey, artwork]);
  return artwork?.uri;
}
