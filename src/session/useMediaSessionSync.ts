import { useEffect } from 'react';
import { clearMediaState, updateMediaState } from '../../modules/compas-media-session/src/index';
import { ConnectionStatus, RemoteUiState } from '../data/types';
import { PlaybackPositionStore } from './PlaybackPositionStore';

export function useMediaSessionSync(state: RemoteUiState, positionStore: PlaybackPositionStore): void {
  const { connectionStatus, currentTrack, isPlaying, volume } = state;

  useEffect(() => {
    if (connectionStatus === ConnectionStatus.Disconnected) {
      clearMediaState().catch(() => {});
      return;
    }
    if (connectionStatus !== ConnectionStatus.Connected || !currentTrack) return;
    const publish = () => {
      const { positionMs, durationMs } = positionStore.getSnapshot();
      updateMediaState({
        title: currentTrack.title,
        artist: currentTrack.artist,
        album: currentTrack.album,
        durationMs,
        artworkUri: currentTrack.artwork,
        isPlaying,
        positionMs,
        volume,
      }).catch(() => {});
    };
    publish();
    return positionStore.subscribe(publish);
  }, [connectionStatus, currentTrack, isPlaying, volume, positionStore]);
}
