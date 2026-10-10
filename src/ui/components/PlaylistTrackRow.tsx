import React, { useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { LibraryEntry } from '../../data/types';
import { usePalette } from '../PaletteProvider';
import { Size, Space } from '../tokens';
import { DragHandleProps } from '../useDragReorder';
import { useEditStagger } from '../useEditStagger';
import { displaySubtitle } from '../library/libraryEntryKind';
import { ArtworkThumb } from './ArtworkThumb';
import { DragHandle } from './DragHandle';
import { IconButton } from './IconButton';
import { ListRow } from './ListRow';
import { PlayingIndicator } from './PlayingIndicator';
import { RemovableRow, RemovableRowHandle } from './RemovableRow';
import { RemoveDiscButton } from './RemoveDiscButton';

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
}: PlaylistTrackRowProps) {
  const palette = usePalette();
  const progress = useEditStagger(editing, index);
  const removable = useRef<RemovableRowHandle>(null);
  const subtitle = displaySubtitle(entry) || undefined;

  const bodyShift = progress.interpolate({ inputRange: [0, 1], outputRange: [0, EDIT_SHIFT] });
  const removeScale = progress.interpolate({ inputRange: [0, 1], outputRange: [REMOVE_START_SCALE, 1] });
  const moreOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const moreShift = progress.interpolate({ inputRange: [0, 1], outputRange: [0, MORE_EXIT_SHIFT] });
  const handleShift = progress.interpolate({ inputRange: [0, 1], outputRange: [HANDLE_ENTER_SHIFT, 0] });

  const removeButton = (
    <Animated.View
      pointerEvents={editing ? 'box-none' : 'none'}
      style={[styles.removeSlot, { opacity: progress, transform: [{ scale: removeScale }] }]}
    >
      <RemoveDiscButton
        label={`Remove ${entry.title} from playlist`}
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
        style={[styles.trailingLayer, { opacity: moreOpacity, transform: [{ translateX: moreShift }] }]}
      >
        {current ? <PlayingIndicator playing={playing} /> : null}
        <IconButton
          icon="moreVertical"
          label={`Song options for ${entry.title}`}
          color={palette.inkMuted}
          onPress={() => onMore(entry)}
        />
      </Animated.View>
      <Animated.View
        pointerEvents={editing ? 'auto' : 'none'}
        importantForAccessibility={editing ? 'auto' : 'no-hide-descendants'}
        style={[styles.handle, { opacity: progress, transform: [{ translateX: handleShift }] }]}
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
        removeLabel="Remove from playlist"
        onRemove={() => onRemove(entry)}
      >
        <ListRow
          title={entry.title}
          subtitle={subtitle}
          leading={<ArtworkThumb uri={entry.artwork} placeholderIcon="music" style={styles.artwork} />}
          trailing={trailing}
          bodyStyle={{ paddingRight: editing ? EDIT_SHIFT : 0, transform: [{ translateX: bodyShift }] }}
          onPress={editing ? undefined : () => onPress(entry)}
          onLongPress={editing ? undefined : () => onMore(entry)}
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
