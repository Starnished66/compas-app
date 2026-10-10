import { useEffect, useMemo, useRef } from 'react';
import { Animated } from 'react-native';
import { Durations, Easings } from './motion';
import { useReducedMotion } from './useReducedMotion';

const GLYPH_START_SCALE = 0.4;

export function usePlayGlyphSwap(playing: boolean) {
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(1)).current;
  const previous = useRef(playing);

  useEffect(() => {
    if (previous.current === playing) return;
    previous.current = playing;
    if (reducedMotion) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: Durations.playGlyph,
      easing: Easings.standard,
      useNativeDriver: true,
    });
    animation.start();
    return () => {
      animation.stop();
      progress.setValue(1);
    };
  }, [playing, progress, reducedMotion]);

  return useMemo(
    () => ({
      opacity: progress,
      transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [GLYPH_START_SCALE, 1] }) }],
    }),
    [progress],
  );
}
