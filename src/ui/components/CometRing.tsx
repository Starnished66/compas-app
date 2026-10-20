import React, { useMemo } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { Canvas, FillType, Group, Path, Rect, Shader, Skia } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';
import { ringBandPath, RingGeometry } from '../chrome/cometRingGeometry';
import { Durations } from '../motion';
import { roundedRectPerimeter } from '../roundedRectPerimeter';
import { useLoopPhase } from '../useLoopPhase';
import { useAppActive } from '../useAppActive';
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

const COMET_SHADER = `
uniform vec2 uCenter;
uniform float uPhase;
uniform vec4 uColor;

half4 main(float2 xy) {
  vec2 p = xy - uCenter;
  float angle = mod(degrees(atan(p.x, -p.y)) - uPhase * 360. + 360., 360.);
  float alpha = angle < 352.
      ? pow(angle / 352., 1.4)
      : (360. - angle) / 8.;
  alpha = clamp(alpha, 0., 1.);
  alpha *= uColor.a;
  return half4(uColor.rgb * alpha, alpha);
}
`;

export function CometRing({ size, radius, strokeWidth, color, busy, style }: CometRingProps) {
  const reducedMotion = useReducedMotion();
  const appActive = useAppActive();
  const phase = useLoopPhase(busy ? Durations.ringBusy : Durations.ringIdle, !reducedMotion && appActive);
  const canvas = size + GLOW_PAD * 2;
  const center = canvas / 2;
  const effect = useMemo(() => Skia.RuntimeEffect.Make(COMET_SHADER), []);
  const skColor = useMemo(() => Skia.Color(color), [color]);

  const paths = useMemo(() => {
    const track = Skia.Path.MakeFromSVGString(
      roundedRectPerimeter({ width: size, height: size, radius, strokeWidth }).path,
    );
    const rings = [
      {
        opacity: 1,
        path: Skia.Path.MakeFromSVGString(ringBandPath({ offset: GLOW_PAD, side: size, radius }, strokeWidth)),
      },
      ...GLOW_BANDS.map((band) => ({
        opacity: band.opacity,
        path: Skia.Path.MakeFromSVGString(
          ringBandPath(
            { offset: GLOW_PAD - band.spread, side: size + band.spread * 2, radius: radius + band.spread },
            strokeWidth + band.spread * 2,
          ),
        ),
      })),
    ];
    for (const ring of rings) ring.path?.setFillType(FillType.EvenOdd);
    return { track, rings };
  }, [radius, size, strokeWidth]);

  const uniforms = useDerivedValue(() => ({
    uCenter: [center, center],
    uPhase: phase.value,
    uColor: [skColor[0], skColor[1], skColor[2], skColor[3]],
  }));

  return (
    <View pointerEvents="none" style={[{ width: size, height: size }, style]}>
      <Canvas style={{ position: 'absolute', width: canvas, height: canvas, left: -GLOW_PAD, top: -GLOW_PAD }}>
        {paths.track ? (
          <Group transform={[{ translateX: GLOW_PAD }, { translateY: GLOW_PAD }]}>
            <Path path={paths.track} color={color} opacity={TRACK_OPACITY} style="stroke" strokeWidth={strokeWidth} />
          </Group>
        ) : null}
        {effect
          ? paths.rings.map((ring, index) =>
              ring.path ? (
                <Group key={index} clip={ring.path} opacity={ring.opacity}>
                  <Rect x={0} y={0} width={canvas} height={canvas}>
                    <Shader source={effect} uniforms={uniforms} />
                  </Rect>
                </Group>
              ) : null,
            )
          : null}
      </Canvas>
    </View>
  );
}
