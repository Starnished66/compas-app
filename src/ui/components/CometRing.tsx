import React, { useId, useMemo } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import Animated, { useAnimatedProps } from 'react-native-reanimated';
import Svg, { ClipPath, Defs, G, GProps, Path } from 'react-native-svg';
import { cometWedges, ringBandPath, RingGeometry, rotationAbout } from '../chrome/cometRingGeometry';
import { Durations } from '../motion';
import { roundedRectPerimeter } from '../roundedRectPerimeter';
import { useLoopPhase } from '../useLoopPhase';
import { useReducedMotion } from '../useReducedMotion';

export interface CometRingProps extends RingGeometry {
  color: string;
  busy: boolean;
  style?: StyleProp<ViewStyle>;
}

const TRACK_OPACITY = 0.28;
const GLOW_BANDS = [
  { spread: 1.5, opacity: 0.3 },
  { spread: 3.5, opacity: 0.12 },
] as const;
const GLOW_PAD = GLOW_BANDS[GLOW_BANDS.length - 1].spread;

// Reanimated writes props straight to the native group, whose rotation prop is `matrix`;
// G's JSX props only declare `transform`, which it converts to `matrix` in JS.
const AnimatedG = Animated.createAnimatedComponent(G as unknown as React.ComponentClass<GProps & { matrix?: number[] }>);

export function CometRing({ size, radius, strokeWidth, color, busy, style }: CometRingProps) {
  const reducedMotion = useReducedMotion();
  const phase = useLoopPhase(busy ? Durations.ringBusy : Durations.ringIdle, !reducedMotion);
  const canvas = size + GLOW_PAD * 2;
  const center = canvas / 2;
  const clipId = `comet${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  const shapes = useMemo(
    () => ({
      track: roundedRectPerimeter({ width: size, height: size, radius, strokeWidth }).path,
      ring: ringBandPath({ offset: GLOW_PAD, side: size, radius }, strokeWidth),
      glows: GLOW_BANDS.map((band) => ({
        opacity: band.opacity,
        path: ringBandPath(
          { offset: GLOW_PAD - band.spread, side: size + band.spread * 2, radius: radius + band.spread },
          strokeWidth + band.spread * 2,
        ),
      })),
      wedges: cometWedges(center, canvas),
    }),
    [canvas, center, radius, size, strokeWidth],
  );

  const rotation = useAnimatedProps(() => ({ matrix: rotationAbout(center, phase.value * 360) }));

  const layers = [{ id: `${clipId}-ring`, path: shapes.ring, opacity: 1 }].concat(
    shapes.glows.map((glow, index) => ({ id: `${clipId}-glow${index}`, path: glow.path, opacity: glow.opacity })),
  );

  return (
    <View pointerEvents="none" style={[{ width: size, height: size }, style]}>
      <Svg width={canvas} height={canvas} style={{ position: 'absolute', left: -GLOW_PAD, top: -GLOW_PAD }}>
        <Defs>
          {layers.map((layer) => (
            <ClipPath key={layer.id} id={layer.id}>
              <Path d={layer.path} fillRule="evenodd" clipRule="evenodd" />
            </ClipPath>
          ))}
        </Defs>
        <G x={GLOW_PAD} y={GLOW_PAD}>
          <Path d={shapes.track} stroke={color} strokeOpacity={TRACK_OPACITY} strokeWidth={strokeWidth} fill="none" />
        </G>
        {layers.map((layer) => (
          <G key={layer.id} clipPath={`url(#${layer.id})`} opacity={layer.opacity}>
            <AnimatedG animatedProps={rotation}>
              {shapes.wedges.map((wedge, wedgeIndex) => (
                <Path key={wedgeIndex} d={wedge.path} fill={color} fillOpacity={wedge.opacity} />
              ))}
            </AnimatedG>
          </G>
        ))}
      </Svg>
    </View>
  );
}
