import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { usePalette } from '../PaletteProvider';
import { Radius, Size } from '../tokens';

export interface RemoveDiscButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

const DISC_SIZE = 22;
const BAR_WIDTH = 10;
const BAR_HEIGHT = 2;
const PRESSED_OPACITY = 0.6;

export function RemoveDiscButton({ label, onPress, disabled }: RemoveDiscButtonProps) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <View style={[styles.disc, { backgroundColor: palette.statusError }]}>
        <View style={[styles.bar, { backgroundColor: palette.background }]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: Size.controlMd,
    height: Size.controlMd,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disc: {
    width: DISC_SIZE,
    height: DISC_SIZE,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bar: {
    width: BAR_WIDTH,
    height: BAR_HEIGHT,
    borderRadius: BAR_HEIGHT / 2,
  },
  pressed: {
    opacity: PRESSED_OPACITY,
  },
});
