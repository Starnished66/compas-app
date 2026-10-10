import React, { ReactNode, useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Distances, Easings, motionDuration } from '../motion';
import { Space } from '../tokens';
import { useReducedMotion } from '../useReducedMotion';

export interface CrossfadeLayersProps {
  showSecond: boolean;
  first: ReactNode;
  second: ReactNode;
}

const LAYER_FADE_MS = 200;
const LAYER_SHIFT_MS = 300;

export function CrossfadeLayers({ showSecond, first, second }: CrossfadeLayersProps) {
  const reducedMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(showSecond ? 1 : 0)).current;
  const shift = useRef(new Animated.Value(showSecond ? 1 : 0)).current;

  useEffect(() => {
    const target = showSecond ? 1 : 0;
    const animation = Animated.parallel([
      Animated.timing(opacity, {
        toValue: target,
        duration: motionDuration(reducedMotion, LAYER_FADE_MS),
        easing: Easings.ease,
        useNativeDriver: true,
      }),
      Animated.timing(shift, {
        toValue: target,
        duration: motionDuration(reducedMotion, LAYER_SHIFT_MS),
        easing: Easings.standard,
        useNativeDriver: true,
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [opacity, reducedMotion, shift, showSecond]);

  const firstStyle = {
    opacity: opacity.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
    transform: [{ translateY: shift.interpolate({ inputRange: [0, 1], outputRange: [0, -Distances.enter] }) }],
  };
  const secondStyle = {
    opacity,
    transform: [{ translateY: shift.interpolate({ inputRange: [0, 1], outputRange: [Distances.enter, 0] }) }],
  };

  return (
    <View style={styles.stack}>
      <Animated.View
        pointerEvents={showSecond ? 'none' : 'auto'}
        accessibilityElementsHidden={showSecond}
        importantForAccessibility={showSecond ? 'no-hide-descendants' : 'auto'}
        style={[styles.layer, firstStyle]}
      >
        {first}
      </Animated.View>
      <Animated.View
        pointerEvents={showSecond ? 'auto' : 'none'}
        accessibilityElementsHidden={!showSecond}
        importantForAccessibility={showSecond ? 'auto' : 'no-hide-descendants'}
        style={[styles.layer, styles.overlay, secondStyle]}
      >
        {second}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    flex: 1,
  },
  layer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
  },
});
