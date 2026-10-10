import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { usePalette } from '../PaletteProvider';
import { Motion, Radius, Size } from '../tokens';

export interface ToggleProps {
  value: boolean;
  label: string;
  onChange?: (value: boolean) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

const TRACK_WIDTH = 44;
const TRACK_HEIGHT = 24;
const KNOB_SIZE = 18;
const KNOB_INSET = 3;
const KNOB_TRAVEL = TRACK_WIDTH - KNOB_SIZE - KNOB_INSET * 2;
const HIT_SLOP = (Size.hitTarget - TRACK_HEIGHT) / 2;

export function Toggle({ value, label, onChange, disabled = false, style }: ToggleProps) {
  const palette = usePalette();
  const position = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(position, {
      toValue: value ? 1 : 0,
      duration: Motion.fast,
      useNativeDriver: false,
    }).start();
  }, [position, value]);

  const trackColor = position.interpolate({
    inputRange: [0, 1],
    outputRange: [palette.surfaceRaised, palette.accent],
  });
  const knobColor = position.interpolate({
    inputRange: [0, 1],
    outputRange: [palette.inkMuted, palette.onAccent],
  });
  const translateX = position.interpolate({ inputRange: [0, 1], outputRange: [0, KNOB_TRAVEL] });

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      onPress={() => onChange?.(!value)}
      disabled={disabled || !onChange}
      hitSlop={HIT_SLOP}
      style={[disabled && styles.disabled, style]}
    >
      <Animated.View style={[styles.track, { backgroundColor: trackColor }]}>
        <Animated.View style={[styles.knob, { backgroundColor: knobColor, transform: [{ translateX }] }]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    borderRadius: Radius.full,
  },
  knob: {
    position: 'absolute',
    top: KNOB_INSET,
    left: KNOB_INSET,
    width: KNOB_SIZE,
    height: KNOB_SIZE,
    borderRadius: Radius.full,
  },
  disabled: {
    opacity: 0.4,
  },
});
