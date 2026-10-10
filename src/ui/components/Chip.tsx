import React from 'react';
import { Animated, Pressable, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { usePalette } from '../PaletteProvider';
import { Radius, Size, Space, Type } from '../tokens';
import { usePressScale } from '../usePressScale';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { IconName } from './iconPaths';

export interface ChipProps {
  label: string;
  onPress?: () => void;
  selected?: boolean;
  icon?: IconName;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

const CHIP_ICON_SIZE = 18;
const CHIP_PRESS_SCALE = 0.93;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Chip({ label, onPress, selected = false, icon, disabled = false, style }: ChipProps) {
  const palette = usePalette();
  const foreground = selected ? palette.onAccentContainer : palette.ink;
  const press = usePressScale(CHIP_PRESS_SCALE);

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      disabled={disabled}
      style={[
        styles.chip,
        { backgroundColor: selected ? palette.accentContainer : palette.surfaceRaised },
        press.pressed && styles.pressed,
        disabled && styles.disabled,
        style,
        { transform: [{ scale: press.scale }] },
      ]}
    >
      {icon ? <Icon name={icon} size={CHIP_ICON_SIZE} color={foreground} filled={selected} /> : null}
      <AppText variant="caption" numberOfLines={1} style={[styles.label, { color: foreground }]}>
        {label}
      </AppText>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: Size.controlSm,
    paddingHorizontal: Space.md,
    borderRadius: Radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  label: {
    fontWeight: Type.micro.fontWeight,
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.4,
  },
});
