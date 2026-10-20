import { useEffect, useMemo, useRef } from 'react';
import { Animated } from 'react-native';
import { RemoteTrack } from '../data/types';
import { Durations, Easings } from './motion';
import { skipDirectionFrom } from './skipDirection';
import { trackKey } from './trackKey';
import { useReducedMotion } from './useReducedMotion';

const ART_SHIFT = 28;
const META_SHIFT = 16;
const ART_START_SCALE = 0.96;

export function useTrackChangeMotion(track: RemoteTrack | null | undefined, active = true) {
  const reducedMotion = useReducedMotion();
  const key = trackKey(track);
  const previousKey = useRef(key);
  const art = useRef(new Animated.Value(0)).current;
  const meta = useRef(new Animated.Value(0)).current;
  const direction = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const fromKey = previousKey.current;
    previousKey.current = key;
    if (!active || !fromKey || !key || fromKey === key || reducedMotion) return;
    direction.setValue(skipDirectionFrom(fromKey));
    art.setValue(1);
    meta.setValue(1);
    const animation = Animated.parallel([
      Animated.timing(art, { toValue: 0, duration: Durations.trackArt, easing: Easings.standard, useNativeDriver: true }),
      Animated.timing(meta, {
        toValue: 0,
        duration: Durations.trackMeta,
        delay: Durations.trackMetaDelay,
        easing: Easings.standard,
        useNativeDriver: true,
      }),
    ]);
    animation.start();
    return () => {
      animation.stop();
      art.setValue(0);
      meta.setValue(0);
    };
  }, [active, art, direction, key, meta, reducedMotion]);

  return useMemo(() => {
    const fade = (value: Animated.Value) => value.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
    const shift = (value: Animated.Value, distance: number) => Animated.multiply(Animated.multiply(value, direction), distance);
    return {
      artStyle: {
        opacity: fade(art),
        transform: [
          { translateX: shift(art, ART_SHIFT) },
          { scale: art.interpolate({ inputRange: [0, 1], outputRange: [1, ART_START_SCALE] }) },
        ],
      },
      metaStyle: { opacity: fade(meta), transform: [{ translateX: shift(meta, META_SHIFT) }] },
    };
  }, [art, direction, meta]);
}
