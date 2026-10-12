import React, { memo } from 'react';
import { Animated, Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Palette } from '../palette';
import { usePalette } from '../PaletteProvider';
import { Radius, Size } from '../tokens';
import { usePressScale } from '../usePressScale';
import { Icon } from './Icon';
import { IconName } from './iconPaths';
import { Spinner } from './Spinner';

export type IconButtonSize = 'sm' | 'md' | 'lg';
export type IconButtonVariant = 'plain' | 'raised' | 'accent' | 'container' | 'outlined';

export interface IconButtonProps {
  icon: IconName;
  label: string;
  onPress?: () => void;
  onLongPress?: () => void;
  size?: IconButtonSize;
  variant?: IconButtonVariant;
  active?: boolean;
  filled?: boolean;
  color?: string;
  iconSize?: number;
  iconStrokeWidth?: number;
  disabled?: boolean;
  busy?: boolean;
  pressScale?: number;
  iconStyle?: Animated.WithAnimatedValue<StyleProp<ViewStyle>>;
  style?: StyleProp<ViewStyle>;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const DIAMETER: Record<IconButtonSize, number> = {
  sm: Size.controlSm,
  md: Size.controlMd,
  lg: Size.controlLg,
};

const PRESS_SCALE: Record<IconButtonSize, number> = {
  sm: 0.92,
  md: 0.9,
  lg: 0.92,
};

const SMALL_HIT_SLOP = (Size.hitTarget - Size.controlSm) / 2;
const BUSY_RING_INSET = 5;

function variantColors(palette: Palette, variant: IconButtonVariant, active: boolean) {
  if (active) return { background: palette.accentContainer, foreground: palette.onAccentContainer };
  switch (variant) {
    case 'accent':
      return { background: palette.accent, foreground: palette.onAccent };
    case 'container':
      return { background: palette.accentContainer, foreground: palette.onAccentContainer };
    case 'raised':
      return { background: palette.surfaceRaised, foreground: palette.ink };
    case 'outlined':
      return { background: palette.frost, foreground: palette.ink };
    default:
      return { background: 'transparent', foreground: palette.ink };
  }
}

function IconButtonContent({
  icon,
  label,
  onPress,
  onLongPress,
  size = 'md',
  variant = 'plain',
  active = false,
  filled,
  color,
  iconSize = Size.icon,
  iconStrokeWidth,
  disabled = false,
  busy = false,
  pressScale,
  iconStyle,
  style,
}: IconButtonProps) {
  const palette = usePalette();
  const diameter = DIAMETER[size];
  const { background, foreground } = variantColors(palette, variant, active);
  const plain = variant === 'plain' && !active;
  const press = usePressScale(pressScale ?? PRESS_SCALE[size]);
  const pressed = press.pressed;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected: active, busy }}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      disabled={disabled}
      hitSlop={size === 'sm' ? SMALL_HIT_SLOP : undefined}
      style={[
        styles.base,
        {
          width: diameter,
          height: diameter,
          backgroundColor: plain && pressed ? palette.surfaceRaised : background,
        },
        variant === 'outlined' && { borderWidth: 1, borderColor: palette.outline },
        pressed && !plain && styles.pressed,
        disabled && styles.disabled,
        style,
        { transform: [{ scale: press.scale }] },
      ]}
    >
      {iconStyle ? (
        <Animated.View style={iconStyle}>
          <Icon name={icon} size={iconSize} color={color ?? foreground} filled={filled} strokeWidth={iconStrokeWidth} />
        </Animated.View>
      ) : (
        <Icon name={icon} size={iconSize} color={color ?? foreground} filled={filled} strokeWidth={iconStrokeWidth} />
      )}
      {busy ? (
        <View pointerEvents="none" style={styles.busyRing}>
          <Spinner size={diameter + BUSY_RING_INSET * 2} color={palette.accent} />
        </View>
      ) : null}
    </AnimatedPressable>
  );
}

export const IconButton = memo(IconButtonContent);

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.4,
  },
  busyRing: {
    position: 'absolute',
    top: -BUSY_RING_INSET,
    left: -BUSY_RING_INSET,
  },
});
