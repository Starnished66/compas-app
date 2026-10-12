import { Dispatch, RefObject, SetStateAction, useState } from 'react';
import { RemoteTrack, RemoteUiState } from '../data/types';
import { NowPlayingArtwork, trackWithArtwork } from './NowPlayingArtwork';
import { createNowPlayingArtworkLookup, NowPlayingArtworkDeps } from './nowPlayingArtworkLookup';

export function useNowPlayingArtwork(
  currentTrackRef: RefObject<RemoteTrack | null>,
  setState: Dispatch<SetStateAction<RemoteUiState>>,
  deps: NowPlayingArtworkDeps
): NowPlayingArtwork {
  const [controller] = useState(
    () =>
      new NowPlayingArtwork(createNowPlayingArtworkLookup(deps), (artwork, key) => {
        const track = trackWithArtwork(currentTrackRef.current, key, artwork);
        if (track) currentTrackRef.current = track;
        setState((prev) => {
          const current = trackWithArtwork(prev.currentTrack, key, artwork);
          return current ? { ...prev, currentTrack: current } : prev;
        });
      })
  );
  return controller;
}
