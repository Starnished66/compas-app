import React from 'react';
import { StyleSheet } from 'react-native';
import { RemoteTrack } from '../../data/types';
import { usePalette } from '../PaletteProvider';
import { trackKey } from '../trackKey';
import { usePlaybackFraction } from '../usePlaybackPosition';
import { useProgressLaps } from '../useProgressLaps';
import { cometGlowPad, ProgressComet } from './ProgressComet';

export interface PlayButtonRingProps {
  track: RemoteTrack;
  playing: boolean;
  buttonSize: number;
}

const RING_GAP = 5;
const HEAD_SIZE = 4;
const PAUSED_HEAD_OPACITY = 0.8;

export const PLAY_BUTTON_RING_OUTSET = RING_GAP + cometGlowPad(HEAD_SIZE);

export function PlayButtonRing({ track, playing, buttonSize }: PlayButtonRingProps) {
  const palette = usePalette();
  const laps = useProgressLaps(trackKey(track) ?? '', usePlaybackFraction());
  const size = buttonSize + RING_GAP * 2;

  return (
    <ProgressComet
      width={size}
      height={size}
      radius={size / 2}
      laps={laps}
      playing={playing}
      color={palette.accent}
      trackColor={palette.surfaceRaised}
      trackOpacity={1}
      headOpacity={PAUSED_HEAD_OPACITY}
      headSize={HEAD_SIZE}
      label="Song progress"
      style={styles.ring}
    />
  );
}

const styles = StyleSheet.create({
  ring: {
    position: 'absolute',
    top: -RING_GAP,
    left: -RING_GAP,
  },
});
