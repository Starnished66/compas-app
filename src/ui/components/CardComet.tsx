import React, { useState } from 'react';
import { Animated, LayoutChangeEvent, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { RemoteTrack } from '../../data/types';
import { usePalette } from '../PaletteProvider';
import { trackKey } from '../trackKey';
import { useProgressLaps } from '../useProgressLaps';
import { ProgressComet } from './ProgressComet';

export interface CardCometProps {
  track: RemoteTrack;
  progress: number;
  playing: boolean;
  radius: number;
  style?: Animated.WithAnimatedValue<StyleProp<ViewStyle>>;
}

interface CometSize {
  width: number;
  height: number;
}

const OUTSET = 1;
const HEAD_SIZE = 5;
const TRACK_OPACITY = 0.6;

export function CardComet({ track, progress, playing, radius, style }: CardCometProps) {
  const palette = usePalette();
  const laps = useProgressLaps(trackKey(track) ?? '', progress);
  const [size, setSize] = useState<CometSize | null>(null);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize((current) => (current?.width === width && current.height === height ? current : { width, height }));
  };

  return (
    <Animated.View pointerEvents="none" onLayout={onLayout} style={[styles.overlay, style]}>
      {size ? (
        <ProgressComet
          width={size.width}
          height={size.height}
          radius={radius + OUTSET}
          laps={laps}
          playing={playing}
          color={palette.accent}
          trackColor={palette.surfaceRaised}
          trackOpacity={TRACK_OPACITY}
          headSize={HEAD_SIZE}
          label="Song progress"
        />
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: -OUTSET,
    left: -OUTSET,
    right: -OUTSET,
    bottom: -OUTSET,
  },
});
