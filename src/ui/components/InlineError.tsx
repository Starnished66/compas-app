import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { usePalette } from '../PaletteProvider';
import { Radius, Space } from '../tokens';
import { AppText } from './AppText';

export interface InlineErrorProps {
  message: string;
  style?: StyleProp<ViewStyle>;
}

const DOT_SIZE = 6;

export function InlineError({ message, style }: InlineErrorProps) {
  const palette = usePalette();
  return (
    <View style={[styles.row, style]}>
      <View style={[styles.dot, { backgroundColor: palette.statusError }]} />
      <AppText variant="caption" accessibilityLiveRegion="polite" style={styles.text}>
        {message}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: Radius.full,
  },
  text: {
    flex: 1,
  },
});
