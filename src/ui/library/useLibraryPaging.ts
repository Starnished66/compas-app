import { useCallback, useRef } from 'react';
import { ViewToken } from 'react-native';
import { ContentStatus, RemoteAction } from '../../data/types';
import { useLibraryArtworkStore } from './libraryArtworkContext';
import { LibraryItem, entriesOfItem } from './libraryItems';

interface LibraryPagingInput {
  hasMore: boolean;
  status: ContentStatus;
  onAction: (action: RemoteAction) => void;
}

export const LIBRARY_VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 1, minimumViewTime: 120 };

export function useLibraryPaging({ hasMore, status, onAction }: LibraryPagingInput) {
  const artworkStore = useLibraryArtworkStore();
  const latest = useRef({ hasMore, status, onAction, artworkStore });
  latest.current = { hasMore, status, onAction, artworkStore };

  const onEndReached = useCallback(() => {
    const current = latest.current;
    if (current.hasMore && current.status !== ContentStatus.Loading) {
      current.onAction({ type: 'LoadMoreLibrary' });
    }
  }, []);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken<LibraryItem>[] }) => {
    for (const token of viewableItems) {
      for (const entry of entriesOfItem(token.item)) {
        if (entry.artwork || !latest.current.artworkStore.claimRequest(entry.id)) continue;
        latest.current.onAction({ type: 'LoadLibraryArtwork', entryId: entry.id });
      }
    }
  }).current;

  return { onEndReached, onViewableItemsChanged };
}
