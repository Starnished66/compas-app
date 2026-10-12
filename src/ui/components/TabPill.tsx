import React from 'react';
import { Animated, StyleSheet } from 'react-native';
import Reanimated, { useAnimatedStyle } from 'react-native-reanimated';
import { between } from '../collapse';
import { TabBarMotion } from '../chrome/useTabBarMotion';
import { usePalette } from '../PaletteProvider';
import { Radius } from '../tokens';

export interface TabPillProps {
  motion: TabBarMotion;
  tabWidth: number;
  minimizedWidth: number;
}

const TAB_SQUASH_INPUT = [0, 0.4, 1];
const TAB_SQUASH_X = [1, 1.18, 1];
const TAB_SQUASH_Y = [1, 0.86, 1];
const MINIMIZE_SQUASH_INPUT = [0, 0.45, 1];
const MINIMIZE_SQUASH_X = [1, 0.9, 1];
const MINIMIZE_SQUASH_Y = [1, 1.08, 1];
const DETACHED_SCALE_X = 1.14;
const DETACHED_SCALE_Y = 1.2;

export function TabPill({ motion, tabWidth, minimizedWidth }: TabPillProps) {
  const palette = usePalette();
  const { slot, collapse, tabSquash, minimizeSquash, detach, pillOpacity } = motion;
  const frostOpacity = detach.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' });
  const accentOpacity = detach.interpolate({ inputRange: [0, 1], outputRange: [1, 0], extrapolate: 'clamp' });
  const bodyStyle = useAnimatedStyle(() => ({ width: between(collapse.value, tabWidth, minimizedWidth) }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.slot,
        {
          opacity: pillOpacity,
          transform: [
            { translateX: Animated.multiply(slot, tabWidth) },
            { scaleX: tabSquash.interpolate({ inputRange: TAB_SQUASH_INPUT, outputRange: TAB_SQUASH_X }) },
            { scaleY: tabSquash.interpolate({ inputRange: TAB_SQUASH_INPUT, outputRange: TAB_SQUASH_Y }) },
            { scaleX: minimizeSquash.interpolate({ inputRange: MINIMIZE_SQUASH_INPUT, outputRange: MINIMIZE_SQUASH_X }) },
            { scaleY: minimizeSquash.interpolate({ inputRange: MINIMIZE_SQUASH_INPUT, outputRange: MINIMIZE_SQUASH_Y }) },
            { scaleX: detach.interpolate({ inputRange: [0, 1], outputRange: [1, DETACHED_SCALE_X] }) },
            { scaleY: detach.interpolate({ inputRange: [0, 1], outputRange: [1, DETACHED_SCALE_Y] }) },
          ],
        },
      ]}
    >
      <Reanimated.View style={[styles.body, bodyStyle]}>
        <Animated.View style={[styles.layer, { backgroundColor: palette.accentContainer, opacity: accentOpacity }]} />
        <Animated.View
          style={[
            styles.layer,
            styles.frost,
            { backgroundColor: palette.frost, borderColor: palette.outline, opacity: frostOpacity },
          ]}
        />
      </Reanimated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  slot: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
  },
  body: {
    flex: 1,
  },
  layer: {
    ...StyleSheet.absoluteFill,
    borderRadius: Radius.md,
  },
  frost: {
    borderWidth: 1,
  },
});
