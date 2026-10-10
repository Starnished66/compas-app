import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Durations, Easings } from '../motion';
import { usePalette } from '../PaletteProvider';
import { useReducedMotion } from '../useReducedMotion';
import { FrostFill } from './FrostFill';

export interface StickyFrostBarProps {
  extended: boolean;
  extension: number;
  children: React.ReactNode;
}

export function StickyFrostBar({ extended, extension, children }: StickyFrostBarProps) {
  const palette = usePalette();
  const reducedMotion = useReducedMotion();
  const reveal = useRef(new Animated.Value(extended ? 1 : 0)).current;

  useEffect(() => {
    const target = extended ? 1 : 0;
    if (reducedMotion) {
      reveal.setValue(target);
      return;
    }
    const animation = Animated.timing(reveal, {
      toValue: target,
      duration: Durations.stickyCap,
      easing: Easings.standard,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [extended, reducedMotion, reveal]);

  const translateY = reveal.interpolate({ inputRange: [0, 1], outputRange: [extension, 0] });

  return (
    <View style={[styles.bar, { borderBottomColor: palette.outline }]}>
      <View pointerEvents="none" style={[styles.extent, { top: -extension }]}>
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateY }] }]}>
          <FrostFill />
        </Animated.View>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderBottomWidth: 1,
  },
  extent: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
});
