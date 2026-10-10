import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { usePalette } from '../PaletteProvider';
import { Space } from '../tokens';
import { AppText } from './AppText';

export interface DetailRowProps {
  label: string;
  value: string;
  stacked?: boolean;
  divided?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function DetailRow({ label, value, stacked = false, divided = false, style }: DetailRowProps) {
  const palette = usePalette();
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}`}
      style={[
        stacked ? styles.stacked : styles.inline,
        divided && { borderTopWidth: 1, borderTopColor: palette.outline },
        style,
      ]}
    >
      <AppText variant="body" tone="inkMuted" style={!stacked && styles.label}>
        {label}
      </AppText>
      <AppText variant="bodyStrong" tabular>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.md,
    paddingHorizontal: Space.lg,
  },
  stacked: {
    gap: Space.xs,
    paddingVertical: Space.md,
    paddingHorizontal: Space.lg,
  },
  label: {
    flex: 1,
  },
});
