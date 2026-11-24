import { useCallback, useEffect, useRef, useState } from 'react';
import { LibraryEntry } from '../../data/types';
import { LibraryEntryKind } from './libraryEntryKind';

export interface CollectionStep {
  entry: LibraryEntry;
  kind: LibraryEntryKind;
}

export function useCollectionTrail(
  entries: LibraryEntry[],
  isNested: boolean,
  jump?: { id: number; album: LibraryEntry | null } | null,
) {
  const [trail, setTrail] = useState<CollectionStep[]>([]);
  const pendingStep = useRef<CollectionStep | null>(null);
  const appliedJump = useRef<number | null>(null);

  useEffect(() => {
    if (!isNested) {
      setTrail((current) => (current.length ? [] : current));
      return;
    }
    const visibleIds = new Set(entries.map((entry) => entry.id));
    const pending = pendingStep.current;
    const entered = pending && !visibleIds.has(pending.entry.id) ? pending : null;
    if (entered) pendingStep.current = null;
    setTrail((current) => {
      let next = current;
      while (next.length && visibleIds.has(next[next.length - 1].entry.id)) next = next.slice(0, -1);
      return entered ? [...next, entered] : next;
    });
  }, [entries, isNested]);

  // Go to Album / Go to Artist start a new trail: the album they land on, or nothing for an artist.
  useEffect(() => {
    if (!jump || jump.id === appliedJump.current) return;
    appliedJump.current = jump.id;
    pendingStep.current = null;
    setTrail(jump.album ? [{ entry: jump.album, kind: 'album' }] : []);
  }, [jump?.id]);

  const rememberOpening = useCallback((step: CollectionStep) => {
    pendingStep.current = step;
  }, []);

  return { current: trail.length ? trail[trail.length - 1] : null, rememberOpening };
}
