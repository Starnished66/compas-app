import React, { useMemo, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { LibraryEntry } from '../../data/types';
import { usePalette } from '../PaletteProvider';
import { Size, Space } from '../tokens';
import { DragHandleProps } from '../useDragReorder';
import { editRange, useEditStagger } from '../useEditStagger';
import { displaySubtitle } from '../library/libraryEntryKind';
import { useEntryArtwork } from '../library/useEntryArtwork';
import { ArtworkThumb } from './ArtworkThumb';
import { DragHandle } from './DragHandle';
import { IconButton } from './IconButton';
import { ListRow } from './ListRow';
import { PlayingIndicator } from './PlayingIndicator';
import { RemovableRow, RemovableRowHandle } from './RemovableRow';
import { RemoveDiscButton } from './RemoveDiscButton';
import { Icon } from './Icon';
import { useI18n } from '../../i18n';

export interface PlaylistTrackRowProps {
  entry: LibraryEntry;
  index: number;
  editing: boolean;
  current?: boolean;
  playing?: boolean;
  lifted?: boolean;
  removeDisabled?: boolean;
  handleProps?: DragHandleProps;
  onPress: (entry: LibraryEntry) => void;
  onMore: (entry: LibraryEntry) => void;
  onRemove: (entry: LibraryEntry) => void;
  selectionMode?: boolean;
  selected?: boolean;
  onSelect?: (entry: LibraryEntry) => void;
  onLongPress?: (entry: LibraryEntry) => void;
}

const ROW_HEIGHT = 56;
const REMOVE_START_SCALE = 0.4;
const MORE_EXIT_SHIFT = -12;
const HANDLE_ENTER_SHIFT = 24;
const TRAILING_WIDTH = Size.controlMd;
const EDIT_SHIFT = Size.controlMd;

function PlaylistTrackRowContent({
  entry,
  index,
  editing,
  current = false,
  playing = false,
  lifted = false,
  removeDisabled = false,
  handleProps,
  onPress,
  onMore,
  onRemove,
  selectionMode = false,
  selected = false,
  onSelect,
  onLongPress,
}: PlaylistTrackRowProps) {
  const { t } = useI18n();
  const palette = usePalette();
  const artworkUri = useEntryArtwork(entry);
  const progress = useEditStagger(editing, index);
  const removable = useRef<RemovableRowHandle>(null);
  const subtitle = displaySubtitle(entry) || undefined;
  const motion = useMemo(
    () => ({
      bodyShift: editRange(progress, 0, EDIT_SHIFT),
      removeSlot: { opacity: progress, transform: [{ scale: editRange(progress, REMOVE_START_SCALE, 1) }] },
      more: { opacity: editRange(progress, 1, 0), transform: [{ translateX: editRange(progress, 0, MORE_EXIT_SHIFT) }] },
      handle: { opacity: progress, transform: [{ translateX: editRange(progress, HANDLE_ENTER_SHIFT, 0) }] },
    }),
    [progress],
  );

  if (selectionMode) {
    return (
      <ListRow
        title={entry.title}
        subtitle={subtitle}
        leading={<ArtworkThumb uri={artworkUri} placeholderIcon="music" style={styles.artwork} />}
        trailing={<Icon name={selected ? 'check' : 'selectionCircle'} color={selected ? palette.accent : palette.inkMuted} />}
        selected={selected}
        onPress={() => onSelect?.(entry)}
        onLongPress={() => onSelect?.(entry)}
        accessibilityLabel={subtitle ? `${entry.title}, ${subtitle}` : entry.title}
        style={styles.row}
      />
    );
  }

  const removeButton = (
    <Animated.View
      pointerEvents={editing ? 'box-none' : 'none'}
      style={[styles.removeSlot, motion.removeSlot]}
    >
      <RemoveDiscButton
        label={t('Remove {title} from playlist', { title: entry.title })}
        disabled={!editing || removeDisabled}
        onPress={() => removable.current?.remove()}
      />
    </Animated.View>
  );

  const trailing = (
    <View style={styles.trailing}>
      <Animated.View
        pointerEvents={editing ? 'none' : 'auto'}
        importantForAccessibility={editing ? 'no-hide-descendants' : 'auto'}
        style={[styles.trailingLayer, motion.more]}
      >
        {current ? <PlayingIndicator playing={playing} /> : null}
        <IconButton
          icon="moreVertical"
          label={t('Song options for {title}', { title: entry.title })}
          color={palette.inkMuted}
          onPress={() => onMore(entry)}
        />
      </Animated.View>
      <Animated.View
        pointerEvents={editing ? 'auto' : 'none'}
        importantForAccessibility={editing ? 'auto' : 'no-hide-descendants'}
        style={[styles.handle, motion.handle]}
      >
        {handleProps ? <DragHandle handle={handleProps} /> : null}
      </Animated.View>
    </View>
  );

  return (
    <View style={lifted && { backgroundColor: palette.surfaceRaised }}>
      <RemovableRow
        ref={removable}
        rowHeight={ROW_HEIGHT}
        removeLabel={t('Remove from playlist')}
        onRemove={() => onRemove(entry)}
      >
        <ListRow
          title={entry.title}
          subtitle={subtitle}
          leading={<ArtworkThumb uri={artworkUri} placeholderIcon="music" style={styles.artwork} />}
          trailing={trailing}
          bodyStyle={{ paddingRight: editing ? EDIT_SHIFT : 0, transform: [{ translateX: motion.bodyShift }] }}
          onPress={editing ? undefined : () => onPress(entry)}
          onLongPress={editing ? undefined : () => onLongPress ? onLongPress(entry) : onMore(entry)}
          accessibilityLabel={subtitle ? `${entry.title}, ${subtitle}` : entry.title}
          style={styles.row}
        />
        {removeButton}
      </RemovableRow>
    </View>
  );
}

export const PlaylistTrackRow = React.memo(PlaylistTrackRowContent);

const styles = StyleSheet.create({
  row: {
    paddingLeft: Space.xs,
  },
  artwork: {
    marginLeft: Space.md,
  },
  removeSlot: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: Space.xs,
    width: Size.controlMd,
    justifyContent: 'center',
  },
  trailing: {
    minWidth: TRAILING_WIDTH,
    height: Size.controlMd,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  trailingLayer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  handle: {
    ...StyleSheet.absoluteFill,
    left: undefined,
    width: Size.controlMd,
  },
});
