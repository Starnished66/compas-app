import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Space } from '../tokens';
import { AppText } from './AppText';
import { ArtworkThumb } from './ArtworkThumb';
import { FlipView } from './FlipView';
import { IconName } from './iconPaths';

export interface AlbumTileProps {
  title: string;
  subtitle?: string;
  artworkUri?: string | null;
  width: number;
  placeholderIcon?: IconName;
  flipKey?: string;
  onPress?: () => void;
  onLongPress?: () => void;
}

export function AlbumTile({
  title,
  subtitle,
  artworkUri,
  width,
  placeholderIcon = 'disc',
  flipKey,
  onPress,
  onLongPress,
}: AlbumTileProps) {
  const artwork = <ArtworkThumb uri={artworkUri} size={width} radius="lg" placeholderIcon={placeholderIcon} />;
  const tile = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.tile, { width }, pressed && styles.pressed]}
    >
      {flipKey ? (
        <FlipView flipKey={flipKey} part="art" artwork={{ uri: artworkUri, radius: 'lg', placeholderIcon }}>
          {artwork}
        </FlipView>
      ) : (
        artwork
      )}
      <View>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" tone="inkMuted" numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
  return flipKey ? <FlipView flipKey={flipKey}>{tile}</FlipView> : tile;
}

const styles = StyleSheet.create({
  tile: {
    gap: Space.sm,
  },
  pressed: {
    transform: [{ scale: 0.96 }],
  },
});
