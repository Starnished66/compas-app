import { useCallback, useContext, useSyncExternalStore } from 'react';
import { PlaybackPosition, PlaybackPositionStore } from '../session/PlaybackPositionStore';
import { PlaybackPositionContext } from './playbackPositionContext';
import { playbackFraction } from './playbackTime';
import { useTabActive } from './tabActivity';

const ignoreChanges = () => () => {};

function usePositionSubscription(store: PlaybackPositionStore) {
  return useTabActive() ? store.subscribe : ignoreChanges;
}

export function usePlaybackPositionStore(): PlaybackPositionStore {
  return useContext(PlaybackPositionContext);
}

export function usePlaybackPosition(): PlaybackPosition {
  const store = usePlaybackPositionStore();
  return useSyncExternalStore(usePositionSubscription(store), store.getSnapshot);
}

export function usePlaybackFraction(): number {
  const store = usePlaybackPositionStore();
  const getFraction = useCallback(() => {
    const { positionMs, durationMs } = store.getSnapshot();
    return playbackFraction(positionMs, durationMs);
  }, [store]);
  return useSyncExternalStore(usePositionSubscription(store), getFraction);
}
