import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { usePalette } from '../PaletteProvider';
import { Radius, Size, Space } from '../tokens';
import { AppText } from './AppText';
import { Icon } from './Icon';

export interface SearchLauncherProps {
  label: string;
  onPress: () => void;
}

const SEARCH_ICON_SIZE = 20;

export function SearchLauncher({ label, onPress }: SearchLauncherProps) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="search"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.field,
        { backgroundColor: palette.surfaceRaised },
        pressed && styles.pressed,
      ]}
    >
      <Icon name="search" size={SEARCH_ICON_SIZE} color={palette.inkMuted} />
      <AppText variant="body" tone="inkMuted" numberOfLines={1}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: {
    height: Size.controlMd,
    borderRadius: Radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    marginHorizontal: Space.lg,
    marginBottom: Space.sm,
  },
  pressed: {
    opacity: 0.8,
  },
});
