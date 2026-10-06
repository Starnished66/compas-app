import React, { useMemo } from 'react';
import { Image, StyleSheet, View, ViewStyle } from 'react-native';
import { ColorScheme } from '../theme';
import { artworkImageSource } from '../artworkSource';

export interface FrostedLayerProps {
  colors: ColorScheme;
  style?: ViewStyle;
}

export const FrostedLayer: React.FC<FrostedLayerProps> = ({ colors, style }) => {
  const dark = colors.onSurface.toUpperCase() === '#F1F1F4';
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: dark ? 'rgba(29,30,34,0.56)' : 'rgba(255,255,255,0.62)' },
        ]}
      />
      <View style={[styles.reflection, { backgroundColor: dark ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.52)' }]} />
    </View>
  );
};

export interface CardSurfaceProps {
  colors: ColorScheme;
  children: React.ReactNode;
  style?: ViewStyle;
  borderRadius?: number;
  backdropUri?: string | null;
}

export const CardSurface: React.FC<CardSurfaceProps> = ({
  colors,
  children,
  style,
  borderRadius = 24,
  backdropUri,
}) => {
  const backdropSource = useMemo(() => artworkImageSource(backdropUri), [backdropUri]);
  return (
    <View
      style={[
        styles.card,
        { borderColor: colors.outline, borderRadius },
        style,
      ]}
    >
      <FrostedLayer colors={colors} />
      {backdropSource && (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Image
            source={backdropSource}
            resizeMode="cover"
            blurRadius={10}
            style={StyleSheet.absoluteFill}
          />
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: colors.onSurface.toUpperCase() === '#F1F1F4'
                  ? 'rgba(17,18,20,0.65)'
                  : 'rgba(255,255,255,0.76)',
              },
            ]}
          />
        </View>
      )}
      <View>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  reflection: {
    height: 1,
    marginHorizontal: 20,
  },
  card: {
    borderWidth: 1,
    overflow: 'hidden',
    padding: 16,
  },
});
