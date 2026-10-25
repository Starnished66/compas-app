import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { usePalette } from '../PaletteProvider';

export interface FrostFillProps {
  radius?: number;
}

const BLUR_INTENSITY = 80;

// Android only blurs through a BlurTargetView that sits outside the blurred view, which a list row can't provide.
const BLUR_SUPPORTED = Platform.OS === 'ios';

export function FrostFill({ radius = 0 }: FrostFillProps) {
  const palette = usePalette();
  return (
    <View pointerEvents="none" style={[styles.fill, { borderRadius: radius }]}>
      {BLUR_SUPPORTED && (
        <BlurView
          style={StyleSheet.absoluteFill}
          intensity={BLUR_INTENSITY}
          tint={palette.dark ? 'systemUltraThinMaterialDark' : 'systemUltraThinMaterialLight'}
        />
      )}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: BLUR_SUPPORTED ? palette.frost : palette.frostSolid }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
});
