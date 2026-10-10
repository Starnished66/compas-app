import React, { ReactNode } from 'react';
import { Animated, Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { usePalette } from '../PaletteProvider';
import { Space, TypeVariant } from '../tokens';
import { AppText, TextTone } from './AppText';

export interface ListRowProps {
  title: string;
  subtitle?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  selected?: boolean;
  active?: boolean;
  disabled?: boolean;
  variant?: 'item' | 'action';
  titleVariant?: TypeVariant;
  titleTone?: TextTone;
  subtitleTabular?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'radio' | 'switch' | 'link';
  bodyStyle?: Animated.WithAnimatedValue<StyleProp<ViewStyle>>;
  style?: StyleProp<ViewStyle>;
}

const ITEM_ROW_MIN_HEIGHT = 56;
const ITEM_ROW_VERTICAL_PADDING = 6;
const ACTION_ROW_HEIGHT = 52;

export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  onPress,
  onLongPress,
  selected = false,
  active = false,
  disabled = false,
  variant = 'item',
  titleVariant,
  titleTone,
  subtitleTabular = false,
  accessibilityLabel,
  accessibilityRole = 'button',
  bodyStyle,
  style,
}: ListRowProps) {
  const palette = usePalette();
  const action = variant === 'action';
  const interactive = Boolean(onPress || onLongPress);
  const text = (
    <View style={styles.text}>
      <AppText
        variant={titleVariant ?? (action ? 'body' : 'bodyStrong')}
        tone={titleTone ?? (active ? 'accent' : 'ink')}
        numberOfLines={1}
      >
        {title}
      </AppText>
      {typeof subtitle === 'string' ? (
        <AppText variant="caption" tone="inkMuted" tabular={subtitleTabular} numberOfLines={1}>
          {subtitle}
        </AppText>
      ) : (
        subtitle
      )}
    </View>
  );

  return (
    <Pressable
      accessibilityRole={interactive ? accessibilityRole : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected, disabled, checked: accessibilityRole === 'radio' ? selected : undefined }}
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled || !interactive}
      style={({ pressed }) => [
        action ? styles.actionRow : styles.itemRow,
        trailing && !action ? styles.withTrailing : null,
        (selected || pressed) && { backgroundColor: palette.surfaceRaised },
        disabled && styles.disabled,
        style,
      ]}
    >
      {bodyStyle ? (
        <Animated.View style={[styles.body, bodyStyle]}>
          {leading}
          {text}
        </Animated.View>
      ) : (
        <>
          {leading}
          {text}
        </>
      )}
      {trailing}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    minHeight: ITEM_ROW_MIN_HEIGHT,
    paddingVertical: ITEM_ROW_VERTICAL_PADDING,
    paddingLeft: Space.lg,
    paddingRight: Space.lg,
  },
  body: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  withTrailing: {
    paddingRight: Space.xs,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.lg,
    minHeight: ACTION_ROW_HEIGHT,
    paddingHorizontal: Space.lg,
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  disabled: {
    opacity: 0.4,
  },
});
