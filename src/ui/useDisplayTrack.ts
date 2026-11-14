import { useMemo } from 'react';
import { dacDisplayTrack, DacMode } from '../data/dacMode';
import { RemoteTrack } from '../data/types';
import { useI18n } from '../i18n';

/** The current track with the translated DAC title and status line while a DAC mode is active. */
export function useDisplayTrack(
  track: RemoteTrack | null | undefined,
  dacMode: DacMode | undefined,
  isPlaying: boolean,
): RemoteTrack | null {
  const { t } = useI18n();
  return useMemo(
    () => (track ? dacDisplayTrack(track, dacMode, isPlaying, t) : null),
    [track, dacMode, isPlaying, t],
  );
}
