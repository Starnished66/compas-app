import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { LibraryEntry } from '../../data/types';
import { Space } from '../tokens';
import { useEntryArtwork } from '../library/useEntryArtwork';
import { AppText } from './AppText';
import { ArtworkThumb } from './ArtworkThumb';
import { FlipView } from './FlipView';
import { IconName } from './iconPaths';

export interface AlbumTileProps {
  entry: LibraryEntry;
  width: number;
  placeholderIcon?: IconName;
  onPress?: (entry: LibraryEntry) => void;
}

function AlbumTileContent({ entry, width, placeholderIcon = 'disc', onPress }: AlbumTileProps) {
  const artworkUri = useEntryArtwork(entry);
  const { id, title, subtitle } = entry;
  return (
    <FlipView flipKey={id}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
        onPress={onPress ? () => onPress(entry) : undefined}
        style={({ pressed }) => [styles.tile, { width }, pressed && styles.pressed]}
      >
        <FlipView flipKey={id} part="art" artwork={{ uri: artworkUri, radius: 'lg', placeholderIcon }}>
          <ArtworkThumb uri={artworkUri} size={width} radius="lg" placeholderIcon={placeholderIcon} />
        </FlipView>
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
    </FlipView>
  );
}

export const AlbumTile = React.memo(AlbumTileContent);

const styles = StyleSheet.create({
  tile: {
    gap: Space.sm,
  },
  pressed: {
    transform: [{ scale: 0.96 }],
  },
});
