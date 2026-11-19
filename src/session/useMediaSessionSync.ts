import { useEffect, useSyncExternalStore } from 'react';
import { clearMediaState, updateMediaMetadata, updateMediaPlayback } from '../../modules/compas-media-session/src/index';
import { ConnectionStatus, RemoteUiState } from '../data/types';
import { PlaybackPositionStore } from './PlaybackPositionStore';
import { trackKey } from '../ui/trackKey';
import { useDisplayTrack } from '../ui/useDisplayTrack';

export function useMediaSessionSync(state: RemoteUiState, positionStore: PlaybackPositionStore): void {
  const { connectionStatus, isPlaying, volume, playerName } = state;
  const currentTrack = useDisplayTrack(state.currentTrack, state.dacMode, isPlaying);
  const track = trackKey(state.currentTrack);
  const { title = '', artist = '', album = '', artwork: artworkUri } = currentTrack ?? {};
  const getDuration = () => positionStore.getSnapshot().durationMs;
  const durationMs = useSyncExternalStore(positionStore.subscribe, getDuration, getDuration);

  useEffect(() => {
    if (connectionStatus === ConnectionStatus.Disconnected) {
      clearMediaState().catch(() => {});
      return;
    }
    if (connectionStatus !== ConnectionStatus.Connected || track === null) return;
    let lastPositionMs: number | undefined;
    const publish = () => {
      const { positionMs } = positionStore.getSnapshot();
      if (positionMs === lastPositionMs) return;
      lastPositionMs = positionMs;
      updateMediaPlayback({ isPlaying, positionMs, volume }).catch(() => {});
    };
    publish();
    return positionStore.subscribe(publish);
  }, [connectionStatus, track, isPlaying, volume, positionStore]);

  useEffect(() => {
    if (connectionStatus !== ConnectionStatus.Connected || track === null) return;
    updateMediaMetadata({ title, artist, album, durationMs, artworkUri, deviceName: playerName }).catch(() => {});
  }, [connectionStatus, track, title, artist, album, durationMs, artworkUri, playerName]);
}
