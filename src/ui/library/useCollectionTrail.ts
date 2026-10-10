import { useCallback, useEffect, useRef, useState } from 'react';
import { LibraryEntry } from '../../data/types';
import { LibraryEntryKind } from './libraryEntryKind';

export interface CollectionStep {
  entry: LibraryEntry;
  kind: LibraryEntryKind;
}

export function useCollectionTrail(entries: LibraryEntry[], isNested: boolean) {
  const [trail, setTrail] = useState<CollectionStep[]>([]);
  const pendingStep = useRef<CollectionStep | null>(null);

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

  const rememberOpening = useCallback((step: CollectionStep) => {
    pendingStep.current = step;
  }, []);

  return { current: trail.length ? trail[trail.length - 1] : null, rememberOpening };
}
