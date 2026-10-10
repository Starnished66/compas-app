import React from 'react';
import { StyleSheet, View } from 'react-native';
import { DragHandleProps } from '../useDragReorder';
import { usePalette } from '../PaletteProvider';
import { Size } from '../tokens';
import { Icon } from './Icon';

export interface DragHandleViewProps {
  handle: DragHandleProps;
}

export function DragHandle({ handle }: DragHandleViewProps) {
  const palette = usePalette();
  return (
    <View {...handle} style={styles.target}>
      <Icon name="dragHandle" color={palette.inkMuted} />
    </View>
  );
}

const styles = StyleSheet.create({
  target: {
    width: Size.controlMd,
    height: Size.controlMd,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
