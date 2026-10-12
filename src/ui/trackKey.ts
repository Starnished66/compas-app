import { RemoteTrack } from '../data/types';

export type TrackIdentity = Pick<RemoteTrack, 'title' | 'artist' | 'album'>;

export function trackKey(track: TrackIdentity | null | undefined): string | null {
  return track ? [track.title, track.artist, track.album].join('\u0000') : null;
}

export function sameSong(a: TrackIdentity | null | undefined, b: TrackIdentity | null | undefined): boolean {
  return Boolean(a && b) && trackKey(a) === trackKey(b);
}
