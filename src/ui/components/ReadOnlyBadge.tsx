import React from 'react';
import { StyleSheet } from 'react-native';
import { usePalette } from '../PaletteProvider';
import { Radius } from '../tokens';
import { AppText } from './AppText';

const BADGE_VERTICAL_PADDING = 2;
const BADGE_HORIZONTAL_PADDING = 6;

export function ReadOnlyBadge() {
  const palette = usePalette();
  return (
    <AppText variant="micro" tone="inkMuted" style={[styles.badge, { borderColor: palette.outline }]}>
      Read only
    </AppText>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: BADGE_HORIZONTAL_PADDING,
    paddingVertical: BADGE_VERTICAL_PADDING,
    borderWidth: 1,
    borderRadius: Radius.sm,
  },
});
