import { useRef } from 'react';
import { RemoteTrack } from '../data/types';
import { trackKey } from './trackKey';

export function useStableTrack(track: RemoteTrack | null | undefined): RemoteTrack | null {
  const stable = useRef(track ?? null);
  if (trackKey(stable.current) !== trackKey(track)) stable.current = track ?? null;
  return stable.current;
}
