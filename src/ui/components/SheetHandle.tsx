import React from 'react';
import { GestureResponderHandlers, Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { usePalette } from '../PaletteProvider';
import { Radius } from '../tokens';

export interface SheetHandleProps {
  label: string;
  onClose: () => void;
  onPress?: () => void;
  dragHandlers?: GestureResponderHandlers;
  style?: StyleProp<ViewStyle>;
}

const HANDLE_WIDTH = 36;
const HANDLE_HEIGHT = 4;
const HANDLE_AREA_PADDING = 10;

export function SheetHandle({ label, onClose, onPress, dragHandlers, style }: SheetHandleProps) {
  const palette = usePalette();
  const handle = <View style={[styles.handle, { backgroundColor: palette.outline }]} />;
  if (onPress && !dragHandlers) {
    return (
      <Pressable
        accessible
        accessibilityLabel={label}
        accessibilityRole="button"
        accessibilityActions={[{ name: 'activate' }]}
        onAccessibilityAction={onClose}
        onPress={onPress}
        style={[styles.area, style]}
      >
        {handle}
      </Pressable>
    );
  }
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
      {handle}
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
