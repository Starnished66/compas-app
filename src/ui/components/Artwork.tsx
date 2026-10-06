import React, { useMemo } from 'react';
import { View, Image, StyleSheet, ViewStyle } from 'react-native';
import { Glyph } from './Glyph';
import { LibraryCategory } from '../../data/types';
import { ColorScheme } from '../theme';
import { artworkImageSource } from '../artworkSource';

export interface ArtworkProps {
  uri?: string | null;
  colors: ColorScheme;
  size?: number;
  borderRadius?: number;
  category?: LibraryCategory | null;
  style?: ViewStyle;
}

const ArtworkContent: React.FC<ArtworkProps> = ({
  uri,
  colors,
  size = 56,
  borderRadius = 12,
  category,
  style,
}) => {
  const getFallbackIcon = () => {
    switch (category) {
      case LibraryCategory.Artists:
      case LibraryCategory.AlbumArtists:
        return 'person';
      case LibraryCategory.Albums:
        return 'disc';
      case LibraryCategory.Playlists:
        return 'list';
      default:
        return 'music';
    }
  };

  const imageSource = useMemo(() => artworkImageSource(uri), [uri]);

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius,
          backgroundColor: colors.surfaceContainerHigh,
        },
        style,
      ]}
    >
      {imageSource ? (
        <Image
          source={imageSource}
          style={{ width: size, height: size, borderRadius }}
          resizeMode="cover"
        />
      ) : (
        <Glyph
          name={getFallbackIcon()}
          size={Math.round(size * 0.45)}
          tint={colors.onSurfaceVariant}
        />
      )}
    </View>
  );
};

export const Artwork = React.memo(ArtworkContent);

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
