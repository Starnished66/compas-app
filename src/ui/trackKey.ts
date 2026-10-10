import { RemoteTrack } from '../data/types';

export function trackKey(track: RemoteTrack | null | undefined): string | null {
  return track ? [track.title, track.artist, track.album].join('\u0000') : null;
}

export function sameSong(a: RemoteTrack | null | undefined, b: RemoteTrack | null | undefined): boolean {
  return Boolean(a && b) && trackKey(a) === trackKey(b);
}
