import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, ImageSourcePropType, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { artworkImageSource } from '../artworkSource';
import { Durations, Easings } from '../motion';
import { Palette } from '../palette';
import { usePalette } from '../PaletteProvider';
import { useReducedMotion } from '../useReducedMotion';

export interface ArtworkBackdropProps {
  artworkUri?: string | null;
  prominent: boolean;
}

interface BackdropLayer {
  id: number;
  key: string;
  source: ImageSourcePropType | null;
}

interface BackdropLayers {
  current: BackdropLayer;
  previous: BackdropLayer | null;
  fade: Animated.Value;
}

const ARTWORK_BLUR_RADIUS = 10;
const ARTWORK_BLEED = 40;
const PROMINENT_WASH = { dark: 0.55, light: 0.5 };
const RECESSED_WASH = { dark: 0.8, light: 0.78 };
const GLOW_MIDPOINT_STRENGTH = 0.7;

const GLOWS = [
  { id: 'glowUpper', size: 400, left: -140, top: 0, opacity: 0.16 },
  { id: 'glowLower', size: 440, right: -170, top: 370, opacity: 0.12 },
] as const;

function renderLayerContent(source: ImageSourcePropType | null, palette: Palette) {
  if (source) {
    return <Image source={source} style={styles.artwork} resizeMode="cover" blurRadius={ARTWORK_BLUR_RADIUS} />;
  }
  return GLOWS.map((glow) => (
    <Svg
      key={glow.id}
      width={glow.size}
      height={glow.size}
      style={[styles.glow, { top: glow.top }, 'left' in glow ? { left: glow.left } : { right: glow.right }]}
    >
      <Defs>
        <RadialGradient id={glow.id} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={palette.accent} stopOpacity={glow.opacity} />
          <Stop offset="0.45" stopColor={palette.accent} stopOpacity={glow.opacity * GLOW_MIDPOINT_STRENGTH} />
          <Stop offset="1" stopColor={palette.accent} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={glow.size / 2} cy={glow.size / 2} r={glow.size / 2} fill={`url(#${glow.id})`} />
    </Svg>
  ));
}

export function ArtworkBackdrop({ artworkUri, prominent }: ArtworkBackdropProps) {
  const palette = usePalette();
  const reducedMotion = useReducedMotion();
  const key = artworkUri ?? '';
  const source = useMemo(() => artworkImageSource(artworkUri), [artworkUri]);
  const [layers, setLayers] = useState<BackdropLayers>(() => ({
    current: { id: 0, key, source },
    previous: null,
    fade: new Animated.Value(1),
  }));
  const washLevels = prominent ? PROMINENT_WASH : RECESSED_WASH;
  const wash = palette.dark ? washLevels.dark : washLevels.light;

  if (layers.current.key !== key) {
    setLayers({
      current: { id: layers.current.id + 1, key, source },
      previous: reducedMotion ? null : layers.current,
      fade: new Animated.Value(reducedMotion ? 1 : 0),
    });
  }

  const fadeRef = useRef(layers.fade);
  fadeRef.current = layers.fade;

  useEffect(() => {
    if (!layers.previous) return;
    const fade = layers.fade;
    const animation = Animated.timing(fade, {
      toValue: 1,
      duration: Durations.backdropCrossfade,
      easing: Easings.ease,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished && fadeRef.current === fade) setLayers((value) => ({ ...value, previous: null }));
    });
    return () => animation.stop();
  }, [layers.fade, layers.previous]);

  return (
    <View pointerEvents="none" style={[styles.root, { backgroundColor: palette.background }]}>
      {layers.previous ? (
        <Animated.View key={layers.previous.id} style={StyleSheet.absoluteFill}>
          {renderLayerContent(layers.previous.source, palette)}
        </Animated.View>
      ) : null}
      <Animated.View key={layers.current.id} style={[StyleSheet.absoluteFill, { opacity: layers.fade }]}>
        {renderLayerContent(layers.current.source, palette)}
      </Animated.View>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.background, opacity: wash }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  artwork: {
    position: 'absolute',
    top: -ARTWORK_BLEED,
    left: -ARTWORK_BLEED,
    right: -ARTWORK_BLEED,
    bottom: -ARTWORK_BLEED,
  },
  glow: {
    position: 'absolute',
  },
});
