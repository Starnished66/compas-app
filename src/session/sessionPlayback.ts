import { isDacActive } from '../data/dacMode';
import type { PlaybackStatus, RemoteTrack } from '../data/types';

export const normalizedVolume = (value: number | null | undefined): number =>
  Number.isFinite(value) ? Math.max(0, Math.min(1, value as number)) : 0.68;

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function trackFromStatus(
  status: PlaybackStatus,
  durationMs: number,
  artwork?: Pick<RemoteTrack, 'artwork'>,
): RemoteTrack | null {
  if (!status.title && !isDacActive(status.dacMode)) return null;
  return {
    id: 'now_playing',
    title: status.title,
    artist: status.artist,
    album: status.album,
    duration: formatDuration(durationMs),
    ...artwork,
    codec: status.codec,
    sourceBitDepth: status.sourceBitDepth,
    sourceSampleRateHz: status.sourceSampleRateHz,
  };
}
