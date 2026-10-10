import React, { useEffect, useId, useMemo, useRef } from 'react';
import { Animated, Easing, StyleProp, View, ViewStyle } from 'react-native';
import Svg, { ClipPath, Defs, G, Path } from 'react-native-svg';
import { cometWedges, ringBandPath, RingGeometry, rotationAbout } from '../chrome/cometRingGeometry';
import { Durations } from '../motion';
import { roundedRectPerimeter } from '../roundedRectPerimeter';
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

export function CometRing({ size, radius, strokeWidth, color, busy, style }: CometRingProps) {
  const reducedMotion = useReducedMotion();
  const phase = useRef(new Animated.Value(0)).current;
  const degrees = useRef(0);
  const rotators = useRef<Array<G<unknown> | null>>([]);
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

  useEffect(() => {
    const listener = phase.addListener(({ value }) => {
      degrees.current = value * 360;
      const matrix = rotationAbout(center, degrees.current);
      rotators.current.forEach((rotator) => rotator?.setNativeProps({ matrix }));
    });
    return () => phase.removeListener(listener);
  }, [center, phase]);

  useEffect(() => {
    phase.setValue(0);
    if (reducedMotion) return;
    const loop = Animated.loop(
      Animated.timing(phase, {
        toValue: 1,
        duration: busy ? Durations.ringBusy : Durations.ringIdle,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [busy, phase, reducedMotion]);

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
        {layers.map((layer, index) => (
          <G key={layer.id} clipPath={`url(#${layer.id})`} opacity={layer.opacity}>
            <G
              ref={(rotator: G<unknown> | null) => {
                rotators.current[index] = rotator;
              }}
              transform={rotationAbout(center, degrees.current)}
            >
              {shapes.wedges.map((wedge, wedgeIndex) => (
                <Path key={wedgeIndex} d={wedge.path} fill={color} fillOpacity={wedge.opacity} />
              ))}
            </G>
          </G>
        ))}
      </Svg>
    </View>
  );
}
