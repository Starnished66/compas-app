import React from 'react';
import { useI18n } from '../../i18n';
import { localizedEntrySubtitle } from '../localizedLabels';
import { Pressable, StyleSheet, View } from 'react-native';
import { LibraryEntry } from '../../data/types';
import { Space } from '../tokens';
import { useEntryArtwork } from '../library/useEntryArtwork';
import { AppText } from './AppText';
import { ArtworkThumb } from './ArtworkThumb';
import { FlipView } from './FlipView';
import { IconName } from './iconPaths';
import { Icon } from './Icon';

export interface AlbumTileProps {
  entry: LibraryEntry;
  width: number;
  placeholderIcon?: IconName;
  onPress?: (entry: LibraryEntry) => void;
  selectionMode?: boolean;
  selected?: boolean;
  onLongPress?: (entry: LibraryEntry) => void;
}

function AlbumTileContent({ entry, width, placeholderIcon = 'disc', onPress, selectionMode = false, selected = false, onLongPress }: AlbumTileProps) {
  const artworkUri = useEntryArtwork(entry);
  const { t } = useI18n();
  const { id, title } = entry;
  const subtitle = localizedEntrySubtitle(entry, t);
  return (
    <FlipView flipKey={id}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
        onPress={onPress ? () => onPress(entry) : undefined}
        onLongPress={onLongPress ? () => onLongPress(entry) : undefined}
        style={({ pressed }) => [styles.tile, { width }, pressed && styles.pressed]}
      >
        <FlipView flipKey={id} part="art" artwork={{ uri: artworkUri, radius: 'lg', placeholderIcon }}>
          <ArtworkThumb uri={artworkUri} size={width} radius="lg" placeholderIcon={placeholderIcon} />
        </FlipView>
        {selectionMode ? <Icon name={selected ? 'check' : 'selectionCircle'} /> : null}
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
