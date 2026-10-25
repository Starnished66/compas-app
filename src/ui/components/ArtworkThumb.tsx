import React, { useEffect, useMemo, useState } from 'react';
import { Image, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { artworkImageSource } from '../artworkSource';
import { usePalette } from '../PaletteProvider';
import { Radius, Size } from '../tokens';
import { Icon } from './Icon';
import { IconName } from './iconPaths';

export interface ArtworkThumbProps {
  uri?: string | null;
  size?: number;
  radius?: 'sm' | 'md' | 'lg' | 'full';
  placeholderIcon?: IconName;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

const SMALL_THUMB_LIMIT = 64;
const SMALL_PLACEHOLDER_ICON = 20;
const LARGE_PLACEHOLDER_ICON_RATIO = 0.31;

function placeholderIconSize(size: number): number {
  return size <= SMALL_THUMB_LIMIT ? SMALL_PLACEHOLDER_ICON : Math.round(size * LARGE_PLACEHOLDER_ICON_RATIO);
}

function ArtworkThumbContent({
  uri,
  size = Size.rowArtwork,
  radius = 'sm',
  placeholderIcon = 'music',
  accessibilityLabel,
  style,
}: ArtworkThumbProps) {
  const palette = usePalette();
  const source = useMemo(() => artworkImageSource(uri), [uri]);
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [uri]);

  const frame = { width: size, height: size, borderRadius: Radius[radius] };

  return (
    <View
      accessible={Boolean(accessibilityLabel)}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
      style={[styles.frame, frame, { backgroundColor: palette.surfaceRaised }, style]}
    >
      {source && !failed ? (
        // Covers are full-size files; decode them at thumbnail size instead of scaling a full bitmap.
        <Image source={source} style={frame} resizeMode="cover" resizeMethod="resize" onError={() => setFailed(true)} />
      ) : (
        <Icon name={placeholderIcon} size={placeholderIconSize(size)} color={palette.inkMuted} />
      )}
    </View>
  );
}

export const ArtworkThumb = React.memo(ArtworkThumbContent);

const styles = StyleSheet.create({
  frame: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
