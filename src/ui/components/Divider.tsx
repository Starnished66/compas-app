import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { usePalette } from '../PaletteProvider';

export interface DividerProps {
  vertical?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Divider({ vertical, style }: DividerProps) {
  const palette = usePalette();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[vertical ? styles.vertical : styles.horizontal, { backgroundColor: palette.outline }, style]}
    />
  );
}

const styles = StyleSheet.create({
  horizontal: { height: 1, alignSelf: 'stretch' },
  vertical: { width: 1, alignSelf: 'stretch' },
});
