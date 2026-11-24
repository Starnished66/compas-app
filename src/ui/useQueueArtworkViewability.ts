import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { readArtwork } from '../data/MemoryArtworkCache';
import type { RemoteAction, RemoteTrack } from '../data/types';
import { VisibleArtwork } from './visibleArtwork';

export const VisibleQueueArtworkContext = createContext<VisibleArtwork<RemoteTrack> | null>(null);
const unsubscribed = () => () => {};
const memoryReference = ({ artwork, artworkReference }: RemoteTrack) =>
  !artwork && typeof artworkReference === 'function' ? artworkReference : undefined;

export function useQueueRowArtwork(row: RemoteTrack) {
  const visibleArtwork = useContext(VisibleQueueArtworkContext);
  return useSyncExternalStore(visibleArtwork?.subscribe ?? unsubscribed, () =>
    row.artwork ?? visibleArtwork?.get(row) ?? readArtwork(row.artworkReference));
}

interface QueueViewabilityChange {
  viewableItems: readonly { index: number | null }[];
}

export function useQueueArtworkViewability(
  rows: readonly (RemoteTrack | undefined)[],
  onAction: (action: RemoteAction) => void,
  enabled = true,
) {
  const visible = useRef<number[]>([]);
  const visibleArtwork = useMemo(() => new VisibleArtwork(memoryReference), []);
  const retried = useRef(new Set<string>()).current;
  const latest = useRef({ rows, onAction, enabled });
  latest.current = { rows, onAction, enabled };

  const retryMissing = useCallback(() => {
    const current = latest.current;
    const rows = current.enabled
      ? visible.current.map((index) => current.rows[index]).filter((row): row is RemoteTrack => Boolean(row))
      : [];
    visibleArtwork.setVisible(rows);
    const visibleIds = new Set(rows.map((row) => row.id));
    for (const id of retried) if (!visibleIds.has(id)) retried.delete(id);
    const ids: string[] = [];
    for (const row of rows) {
      if (retried.has(row.id) || !memoryReference(row) || visibleArtwork.get(row)) continue;
      // Two visible covers may exceed the cache budget together.
      retried.add(row.id);
      ids.push(row.id);
    }
    if (ids.length) current.onAction({ type: 'RetryQueueArtwork', ids });
  }, [retried, visibleArtwork]);

  useLayoutEffect(retryMissing, [rows, enabled, retryMissing]);

  const onViewableItemsChanged = useCallback(({ viewableItems }: QueueViewabilityChange) => {
    visible.current = viewableItems.map(({ index }) => index).filter((index) => index !== null);
    retryMissing();
  }, [retryMissing]);

  return { onViewableItemsChanged, visibleArtwork };
}
