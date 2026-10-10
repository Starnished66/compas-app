import React from 'react';
import { StyleSheet, View, ViewProps } from 'react-native';
import { usePalette } from '../PaletteProvider';
import { Radius, Space } from '../tokens';

export interface CardProps extends ViewProps {
  variant?: 'frost' | 'surface';
  padded?: boolean;
}

export function Card({ variant = 'frost', padded, style, ...rest }: CardProps) {
  const palette = usePalette();
  return (
    <View
      {...rest}
      style={[
        styles.card,
        { backgroundColor: palette[variant], borderColor: palette.outline },
        padded && styles.padded,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  padded: {
    padding: Space.lg,
  },
});
