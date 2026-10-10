import React, { ReactNode } from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { usePalette } from '../PaletteProvider';
import { Size, Space } from '../tokens';
import { AppText } from './AppText';

export interface SectionHeaderProps {
  label: string;
  tone?: 'accent' | 'muted';
  caption?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionSelected?: boolean;
  trailing?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

const ACTION_MIN_WIDTH = 52;

export function SectionHeader({
  label,
  tone = 'accent',
  caption,
  actionLabel,
  onAction,
  actionSelected = false,
  trailing,
  style,
}: SectionHeaderProps) {
  const palette = usePalette();

  return (
    <View style={[styles.row, style]}>
      <AppText
        variant="eyebrow"
        tone={tone === 'accent' ? 'accent' : 'inkMuted'}
        accessibilityRole="header"
        numberOfLines={1}
      >
        {label}
      </AppText>
      <AppText variant="caption" tone="inkMuted" tabular numberOfLines={1} style={styles.caption}>
        {caption ?? ''}
      </AppText>
      {trailing}
      {actionLabel ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: actionSelected }}
          onPress={onAction}
          hitSlop={(Size.hitTarget - Size.controlSm) / 2}
          style={({ pressed }) => [
            styles.action,
            pressed && { backgroundColor: palette.surfaceRaised },
          ]}
        >
          <AppText variant="bodyStrong" tone={actionSelected ? 'accent' : 'ink'}>
            {actionLabel}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    minHeight: Size.controlMd,
    paddingLeft: Space.lg,
    paddingRight: Space.sm,
  },
  caption: {
    flex: 1,
  },
  action: {
    height: Size.controlSm,
    minWidth: ACTION_MIN_WIDTH,
    paddingHorizontal: Space.sm,
    borderRadius: Size.controlSm / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
