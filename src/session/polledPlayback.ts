import { RemoteUiState } from '../data/types';

export type PolledPlayback = Pick<RemoteUiState, 'isPlaying' | 'volume' | 'currentTrack' | 'playbackMode' | 'currentFavorite'>;

export function polledPlaybackChanged(prev: PolledPlayback, polled: PolledPlayback): boolean {
  return (
    prev.isPlaying !== polled.isPlaying ||
    prev.volume !== polled.volume ||
    prev.currentTrack !== polled.currentTrack ||
    prev.playbackMode !== polled.playbackMode ||
    prev.currentFavorite !== polled.currentFavorite
  );
}

export function withPolledPlayback<State extends PolledPlayback>(prev: State, polled: PolledPlayback): State {
  return polledPlaybackChanged(prev, polled) ? { ...prev, ...polled } : prev;
}
