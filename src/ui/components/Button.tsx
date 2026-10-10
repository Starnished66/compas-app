import React from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Palette } from '../palette';
import { usePalette } from '../PaletteProvider';
import { Radius, Size, Space, Type } from '../tokens';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { IconName } from './iconPaths';
import { Spinner } from './Spinner';

export type ButtonVariant = 'accent' | 'container' | 'raised' | 'plain' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  icon?: IconName;
  iconColor?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fill?: boolean;
  disabled?: boolean;
  busy?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

const HEIGHT: Record<ButtonSize, number> = {
  sm: Size.controlSm,
  md: Size.controlMd,
  lg: Size.controlLg,
};

const BUTTON_ICON_SIZE = 18;
const DESTRUCTIVE_DOT_SIZE = 8;

function variantColors(palette: Palette, variant: ButtonVariant, inactive: boolean) {
  if (inactive && variant !== 'plain') return { background: palette.surfaceRaised, foreground: palette.inkMuted };
  switch (variant) {
    case 'accent':
      return { background: palette.accent, foreground: palette.onAccent };
    case 'container':
      return { background: palette.accentContainer, foreground: palette.onAccentContainer };
    case 'raised':
      return { background: palette.surfaceRaised, foreground: palette.ink };
    case 'destructive':
      return { background: 'transparent', foreground: palette.ink };
    default:
      return { background: 'transparent', foreground: inactive ? palette.inkMuted : palette.ink };
  }
}

export function Button({
  label,
  onPress,
  icon,
  iconColor,
  variant = 'accent',
  size = 'md',
  fill,
  disabled = false,
  busy = false,
  accessibilityLabel,
  style,
}: ButtonProps) {
  const palette = usePalette();
  const inactive = disabled && !busy;
  const { background, foreground } = variantColors(palette, variant, inactive);
  const plain = variant === 'plain';
  const destructive = variant === 'destructive' && !inactive;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.base,
        {
          height: HEIGHT[size],
          paddingHorizontal: plain ? Space.sm : size === 'sm' ? Space.md : Space.xl,
          backgroundColor: plain && pressed ? palette.surfaceRaised : background,
        },
        destructive && { borderWidth: 1, borderColor: palette.statusError },
        fill && styles.fill,
        pressed && !plain && styles.pressed,
        style,
      ]}
    >
      {busy ? <Spinner size={BUTTON_ICON_SIZE} color={foreground} /> : null}
      {!busy && icon ? <Icon name={icon} size={BUTTON_ICON_SIZE} color={iconColor ?? foreground} /> : null}
      {!busy && destructive ? (
        <View style={[styles.destructiveDot, { backgroundColor: palette.statusError }]} />
      ) : null}
      <AppText
        variant={size === 'sm' ? 'caption' : 'bodyStrong'}
        numberOfLines={1}
        style={[{ color: foreground }, size === 'sm' && styles.smallLabel]}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
  },
  fill: {
    flex: 1,
  },
  pressed: {
    opacity: 0.8,
  },
  destructiveDot: {
    width: DESTRUCTIVE_DOT_SIZE,
    height: DESTRUCTIVE_DOT_SIZE,
    borderRadius: Radius.full,
  },
  smallLabel: {
    fontWeight: Type.bodyStrong.fontWeight,
  },
});
