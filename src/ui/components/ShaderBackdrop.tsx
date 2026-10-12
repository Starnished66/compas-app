import React, { useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useDerivedValue } from 'react-native-reanimated';
import { Canvas, Fill, Shader, Skia } from '@shopify/react-native-skia';
import { SHADER_STYLE_ANIMATES, ShaderBackgroundStyle } from '../backgroundStyle';
import { backdropShaderSource } from '../backdrop/backdropShader';
import { backdropUniforms } from '../backdrop/backdropUniforms';
import { useAlbumPalette } from '../backdrop/useAlbumPalette';
import { useShaderTime } from '../backdrop/useShaderTime';
import { useUniformCrossfade } from '../backdrop/useUniformCrossfade';
import { usePalette } from '../PaletteProvider';
import { useAppActive } from '../useAppActive';
import { useReducedMotion } from '../useReducedMotion';

export interface ShaderBackdropProps {
  style: ShaderBackgroundStyle;
  artworkUri: string | null;
  prominent: boolean;
  paused: boolean;
}

const RENDER_SCALE = 1 / 3;
const FRAMES_PER_SECOND = 30;
const PALETTE_CROSSFADE_MS = 1500;
const FOCUS = { prominent: 0.35, recessed: 0.15 };

export function ShaderBackdrop({ style, artworkUri, prominent, paused }: ShaderBackdropProps) {
  const palette = usePalette();
  const reducedMotion = useReducedMotion();
  const appActive = useAppActive();
  const window = useWindowDimensions();
  const animates = SHADER_STYLE_ANIMATES[style];
  const time = useShaderTime(animates && !reducedMotion && appActive && !paused, FRAMES_PER_SECOND);
  const album = useAlbumPalette(artworkUri, palette.accent);
  const effect = useMemo(() => Skia.RuntimeEffect.Make(backdropShaderSource(style)), [style]);

  const width = Math.max(1, Math.round(window.width * RENDER_SCALE));
  const height = Math.max(1, Math.round(window.height * RENDER_SCALE));
  const theme = palette.dark ? 'dark' : 'light';
  const focus = prominent ? FOCUS.prominent : FOCUS.recessed;
  const target = useMemo(
    () => backdropUniforms({ palette: album.palette, seed: album.seed, theme, focus, width, height }),
    [album, theme, focus, width, height],
  );
  const colors = useUniformCrossfade(target, PALETTE_CROSSFADE_MS, !reducedMotion);
  const uniforms = useDerivedValue(() => ({ ...colors.value, uTime: animates ? time.value : 0 }));

  return (
    <View pointerEvents="none" style={[styles.root, { backgroundColor: palette.background }]}>
      {effect ? (
        <Canvas opaque style={[styles.canvas, { width, height, transform: [{ scale: 1 / RENDER_SCALE }] }]}>
          <Fill>
            <Shader source={effect} uniforms={uniforms} />
          </Fill>
        </Canvas>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  canvas: {
    position: 'absolute',
    top: 0,
    left: 0,
    transformOrigin: 'top left',
  },
});
