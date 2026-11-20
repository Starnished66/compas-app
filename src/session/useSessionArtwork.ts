import { useNowPlayingArtwork } from './useNowPlayingArtwork';
import { BluetoothRequestPolicy } from './BluetoothRequestPolicy';
import { createSessionArtwork } from './sessionArtwork';
import type { SessionState } from './useSessionRefs';
import type { EntryTarget } from './LibraryEntryFactory';

export function useSessionArtwork(shared: SessionState, libraryTarget: (id: string) => EntryTarget | undefined) {
  const {
    apiRef, bluetoothAudioOutputRef, currentTrackRef, lastBluetoothArtworkAtRef,
    setState, stateRef, syncedCatalogStoreRef,
  } = shared;

  // Artwork lookups run after the artwork source is ready.
  const nowPlayingArtwork = useNowPlayingArtwork(currentTrackRef, setState, {
    sources: () => artworkSources(null),
    catalogStore: syncedCatalogStoreRef.current,
    api: () => apiRef.current,
    onRemoteRequest: () => {
      if (BluetoothRequestPolicy.requiresBluetoothAudioPriority(stateRef.current.connectionTransport, bluetoothAudioOutputRef.current)) {
        lastBluetoothArtworkAtRef.current = Date.now();
      }
    },
  });

  const { clearArtworkState, loadLibraryArtwork, ownsCurrentPlayer, artworkSources } = createSessionArtwork({
    shared,
    libraryTarget,
    nowPlayingArtwork,
  });

  return { nowPlayingArtwork, clearArtworkState, loadLibraryArtwork, ownsCurrentPlayer, artworkSources };
}
