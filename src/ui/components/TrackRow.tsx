import React, { ReactNode } from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { usePalette } from '../PaletteProvider';
import { Radius, Size, Space } from '../tokens';
import { AppText } from './AppText';
import { ArtworkThumb } from './ArtworkThumb';
import { IconButton } from './IconButton';
import { IconName } from './iconPaths';
import { ListRow } from './ListRow';
import { PlayingIndicator } from './PlayingIndicator';

export interface TrackRowProps {
  title: string;
  subtitle?: string;
  artworkUri?: string | null;
  number?: number;
  showArtwork?: boolean;
  artworkSize?: number;
  placeholderIcon?: IconName;
  duration?: string;
  current?: boolean;
  playing?: boolean;
  selected?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  onMore?: () => void;
  moreLabel?: string;
  onRemove?: () => void;
  removeLabel?: string;
  accessory?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

const NUMBER_COLUMN_WIDTH = 20;
const REMOVE_DISC_SIZE = 22;
const REMOVE_BAR_WIDTH = 10;
const REMOVE_BAR_HEIGHT = 2;

export function TrackRow({
  title,
  subtitle,
  artworkUri,
  number,
  showArtwork = number === undefined,
  artworkSize = Size.rowArtwork,
  placeholderIcon = 'music',
  duration,
  current = false,
  playing = false,
  selected,
  disabled,
  onPress,
  onLongPress,
  onMore,
  moreLabel = 'Song options',
  onRemove,
  removeLabel = 'Remove from queue',
  accessory,
  style,
}: TrackRowProps) {
  const palette = usePalette();

  const leading = (
    <>
      {onRemove ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={removeLabel}
          onPress={onRemove}
          style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}
        >
          <View style={[styles.removeDisc, { backgroundColor: palette.statusError }]}>
            <View style={[styles.removeBar, { backgroundColor: palette.background }]} />
          </View>
        </Pressable>
      ) : null}
      {number !== undefined ? (
        <AppText variant="caption" tone="inkMuted" tabular style={styles.number}>
          {number}
        </AppText>
      ) : null}
      {showArtwork ? (
        <ArtworkThumb uri={artworkUri} size={artworkSize} placeholderIcon={placeholderIcon} />
      ) : null}
    </>
  );

  const hasTrailing = current || Boolean(duration) || Boolean(onMore) || Boolean(accessory);
  const trailing = hasTrailing ? (
    <View style={styles.trailing}>
      {current ? <PlayingIndicator playing={playing} /> : null}
      {duration ? (
        <AppText variant="caption" tone="inkMuted" tabular>
          {duration}
        </AppText>
      ) : null}
      {onMore ? (
        <IconButton icon="moreVertical" label={moreLabel} onPress={onMore} color={palette.inkMuted} />
      ) : null}
      {accessory}
    </View>
  ) : undefined;

  return (
    <ListRow
      title={title}
      subtitle={subtitle}
      leading={leading}
      trailing={trailing}
      onPress={onPress}
      onLongPress={onLongPress}
      selected={selected}
      disabled={disabled}
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      style={[onRemove && styles.editing, hasTrailing && !onMore && !accessory && styles.noMoreButton, style]}
    />
  );
}

const styles = StyleSheet.create({
  removeButton: {
    width: Size.controlMd,
    height: Size.controlMd,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeDisc: {
    width: REMOVE_DISC_SIZE,
    height: REMOVE_DISC_SIZE,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBar: {
    width: REMOVE_BAR_WIDTH,
    height: REMOVE_BAR_HEIGHT,
    borderRadius: REMOVE_BAR_HEIGHT / 2,
  },
  pressed: {
    opacity: 0.6,
  },
  number: {
    width: NUMBER_COLUMN_WIDTH,
    textAlign: 'right',
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  editing: {
    paddingLeft: Space.xs,
  },
  noMoreButton: {
    paddingRight: Space.lg,
  },
});
