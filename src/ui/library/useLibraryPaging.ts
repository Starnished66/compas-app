import { useCallback, useEffect, useMemo, useRef } from 'react';
import { ViewToken } from 'react-native';
import { ContentStatus, RemoteAction } from '../../data/types';
import { useLibraryArtworkStore } from './libraryArtworkContext';
import { LibraryItem, entriesOfItem } from './libraryItems';
import { VisibleArtwork } from '../visibleArtwork';

interface LibraryPagingInput {
  items: readonly LibraryItem[];
  hasMore: boolean;
  status: ContentStatus;
  onAction: (action: RemoteAction) => void;
}

export const LIBRARY_VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 1, minimumViewTime: 120 };

export function useLibraryPaging({ items, hasMore, status, onAction }: LibraryPagingInput) {
  const artworkStore = useLibraryArtworkStore();
  const visibleArtwork = useMemo(() => new VisibleArtwork(artworkStore.memoryArtworkReference), [artworkStore]);
  const latest = useRef({ items, hasMore, status, onAction });
  latest.current = { items, hasMore, status, onAction };
  const visible = useRef<number[]>([]);
  const retried = useRef(new Set<string>()).current;

  const onEndReached = useCallback(() => {
    const current = latest.current;
    if (current.hasMore && current.status !== ContentStatus.Loading) {
      current.onAction({ type: 'LoadMoreLibrary' });
    }
  }, []);

  const requestVisibleArtwork = useCallback((evictedOnly: boolean) => {
    const current = latest.current;
    const entries = visible.current.flatMap((index) => {
      const item = current.items[index];
      return item ? entriesOfItem(item) : [];
    });
    visibleArtwork.setVisible(entries);
    const visibleIds = new Set(entries.map((entry) => entry.id));
    for (const id of retried) if (!visibleIds.has(id)) retried.delete(id);
    for (const entry of entries) {
      if (retried.has(entry.id) || visibleArtwork.get(entry) || artworkStore.getEntryArtwork(entry)) continue;
      const evicted = Boolean(artworkStore.memoryArtworkReference(entry));
      if ((evictedOnly && !evicted) || !artworkStore.claimRequest(entry.id, evicted)) continue;
      // Covers that cannot coexist in memory get one retry per visibility period.
      if (evicted) retried.add(entry.id);
      current.onAction({ type: 'LoadLibraryArtwork', entryId: entry.id });
    }
  }, [artworkStore, retried, visibleArtwork]);

  useEffect(() => artworkStore.subscribe(() => requestVisibleArtwork(true)), [artworkStore, requestVisibleArtwork]);
  useEffect(() => requestVisibleArtwork(false), [items, requestVisibleArtwork]);

  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: Pick<ViewToken<LibraryItem>, 'index'>[] }) => {
    visible.current = viewableItems.map(({ index }) => index).filter((index) => index !== null);
    requestVisibleArtwork(false);
  }, [requestVisibleArtwork]);

  return { onEndReached, onViewableItemsChanged, visibleArtwork };
}
