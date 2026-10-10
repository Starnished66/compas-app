import React from 'react';
import { GestureResponderHandlers, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { usePalette } from '../PaletteProvider';
import { Radius } from '../tokens';

export interface SheetHandleProps {
  label: string;
  onClose: () => void;
  dragHandlers?: GestureResponderHandlers;
  style?: StyleProp<ViewStyle>;
}

const HANDLE_WIDTH = 36;
const HANDLE_HEIGHT = 4;
const HANDLE_AREA_PADDING = 10;

export function SheetHandle({ label, onClose, dragHandlers, style }: SheetHandleProps) {
  const palette = usePalette();
  return (
    <View
      {...dragHandlers}
      accessible
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={onClose}
      style={[styles.area, style]}
    >
      <View style={[styles.handle, { backgroundColor: palette.outline }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  area: {
    alignItems: 'center',
    paddingVertical: HANDLE_AREA_PADDING,
  },
  handle: {
    width: HANDLE_WIDTH,
    height: HANDLE_HEIGHT,
    borderRadius: Radius.full,
  },
});
