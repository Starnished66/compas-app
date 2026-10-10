import { useEffect, useMemo, useRef } from 'react';
import { Animated } from 'react-native';
import { Durations, Easings } from '../motion';
import { useReducedMotion } from '../useReducedMotion';

export type PlayerStatusPhase = 'connected' | 'busy' | 'error' | 'offline';

const SHAKE_INPUT = [0, 0.2, 0.4, 0.6, 0.8, 1];
const SHAKE_OFFSETS = [0, -4, 4, -3, 2, 0];
const BUMP_INPUT = [0, 0.35, 1];
const BUMP_SCALE = [1, 1.14, 1];
const DIP_INPUT = [0, 0.5, 1];
const DIP_OPACITY = [1, 0.4, 1];
const DIP_OFFSET = [0, 2, 0];
const WIGGLE_INPUT = [0, 1 / 3, 2 / 3, 1];
const WIGGLE_ROTATION = ['0deg', '-10deg', '8deg', '0deg'];
const RIPPLE_SCALE = 3.4;
const RIPPLE_OPACITY = 0.7;

export function usePlayerStatusMotion(phase: PlayerStatusPhase) {
  const reducedMotion = useReducedMotion();
  const shake = useRef(new Animated.Value(1)).current;
  const bump = useRef(new Animated.Value(1)).current;
  const dip = useRef(new Animated.Value(1)).current;
  const wiggle = useRef(new Animated.Value(1)).current;
  const ripple = useRef(new Animated.Value(1)).current;
  const previous = useRef(phase);

  useEffect(() => {
    if (previous.current === phase) return;
    previous.current = phase;
    if (reducedMotion) return;
    const play = (value: Animated.Value, duration: number, easing: (t: number) => number) => {
      value.setValue(0);
      return Animated.timing(value, { toValue: 1, duration, easing, useNativeDriver: true });
    };
    if (phase === 'connected') {
      Animated.parallel([play(ripple, Durations.ripple, Easings.easeOut), play(bump, Durations.bump, Easings.standard)]).start();
    } else if (phase === 'error') {
      play(shake, Durations.shake, Easings.easeInOut).start();
    } else if (phase === 'offline') {
      play(dip, Durations.dip, Easings.standard).start();
    } else {
      play(wiggle, Durations.wiggle, Easings.standard).start();
    }
  }, [bump, dip, phase, reducedMotion, ripple, shake, wiggle]);

  return useMemo(
    () => ({
      buttonStyle: { transform: [{ translateX: shake.interpolate({ inputRange: SHAKE_INPUT, outputRange: SHAKE_OFFSETS }) }] },
      iconStyle: {
        opacity: dip.interpolate({ inputRange: DIP_INPUT, outputRange: DIP_OPACITY }),
        transform: [
          { translateY: dip.interpolate({ inputRange: DIP_INPUT, outputRange: DIP_OFFSET }) },
          { scale: bump.interpolate({ inputRange: BUMP_INPUT, outputRange: BUMP_SCALE }) },
          { rotate: wiggle.interpolate({ inputRange: WIGGLE_INPUT, outputRange: WIGGLE_ROTATION }) },
        ],
      },
      rippleStyle: {
        opacity: ripple.interpolate({ inputRange: [0, 1], outputRange: [RIPPLE_OPACITY, 0] }),
        transform: [{ scale: ripple.interpolate({ inputRange: [0, 1], outputRange: [1, RIPPLE_SCALE] }) }],
      },
    }),
    [bump, dip, ripple, shake, wiggle],
  );
}
