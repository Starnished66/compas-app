import React from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { RemoteTrack } from '../../data/types';
import { DragHandleProps } from '../useDragReorder';
import { useEditStagger } from '../useEditStagger';
import { usePalette } from '../PaletteProvider';
import { Radius, Size, Space } from '../tokens';
import { AppText } from './AppText';
import { ArtworkThumb } from './ArtworkThumb';
import { Icon } from './Icon';
import { PlayingIndicator } from './PlayingIndicator';

export interface UpNextRowProps {
  track: RemoteTrack;
  index: number;
  editing: boolean;
  current: boolean;
  playing: boolean;
  onPress: (track: RemoteTrack) => void;
  onRemove: (track: RemoteTrack) => void;
  dragHandle?: DragHandleProps;
}

export const UP_NEXT_ROW_HEIGHT = 56;
const REMOVE_SLOT_WIDTH = Size.controlMd;
const REMOVE_DISC_SIZE = 22;
const REMOVE_BAR_WIDTH = 10;
const REMOVE_BAR_HEIGHT = 2;
const REMOVE_START_SCALE = 0.4;
const TRAILING_EXIT_SHIFT = -12;
const HANDLE_ENTER_SHIFT = 24;
const ROW_VERTICAL_PADDING = 6;
const EDIT_SHIFT = Space.xs + REMOVE_SLOT_WIDTH + Space.md - Space.lg;

function UpNextRowContent({ track, index, editing, current, playing, onPress, onRemove, dragHandle }: UpNextRowProps) {
  const palette = usePalette();
  const progress = useEditStagger(editing, index);
  const between = (from: number, to: number) => progress.interpolate({ inputRange: [0, 1], outputRange: [from, to] });
  const subtitle = track.artist || 'Unknown artist';

  return (
    <Pressable
      accessible={!editing}
      accessibilityRole={editing ? undefined : 'button'}
      accessibilityLabel={`${track.title}, ${subtitle}`}
      accessibilityState={{ selected: current && !editing }}
      disabled={editing}
      onPress={() => onPress(track)}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: palette.surfaceRaised }]}
    >
      <View style={styles.content}>
        <Animated.View
          style={[styles.shifted, { paddingRight: editing ? EDIT_SHIFT : 0, transform: [{ translateX: between(0, EDIT_SHIFT) }] }]}
        >
          <ArtworkThumb uri={track.artwork} size={Size.rowArtwork} placeholderIcon="music" />
          <View style={styles.text}>
            <AppText variant="bodyStrong" tone={current && !editing ? 'accent' : 'ink'} numberOfLines={1}>
              {track.title}
            </AppText>
            <AppText variant="caption" tone="inkMuted" numberOfLines={1}>
              {subtitle}
            </AppText>
          </View>
        </Animated.View>
        <Animated.View
          pointerEvents={editing ? 'box-none' : 'none'}
          style={[styles.removeSlot, { opacity: progress, transform: [{ scale: between(REMOVE_START_SCALE, 1) }] }]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove ${track.title} from queue`}
            accessibilityElementsHidden={!editing}
            importantForAccessibility={editing ? 'auto' : 'no-hide-descendants'}
            onPress={() => onRemove(track)}
            style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}
          >
            <View style={[styles.removeDisc, { backgroundColor: palette.statusError }]}>
              <View style={[styles.removeBar, { backgroundColor: palette.background }]} />
            </View>
          </Pressable>
        </Animated.View>
        <View style={[styles.trailing, dragHandle && styles.trailingWithHandle]}>
          <Animated.View
            pointerEvents="none"
            style={[styles.details, { opacity: between(1, 0), transform: [{ translateX: between(0, TRAILING_EXIT_SHIFT) }] }]}
          >
            {current ? <PlayingIndicator playing={playing} /> : null}
            {track.duration ? (
              <AppText variant="caption" tone="inkMuted" tabular>
                {track.duration}
              </AppText>
            ) : null}
          </Animated.View>
          {dragHandle ? (
            <Animated.View
              pointerEvents={editing ? 'auto' : 'none'}
              style={[styles.handle, { opacity: progress, transform: [{ translateX: between(HANDLE_ENTER_SHIFT, 0) }] }]}
              accessibilityElementsHidden={!editing}
              importantForAccessibility={editing ? 'auto' : 'no-hide-descendants'}
            >
              <View {...dragHandle} style={styles.handleTarget}>
                <Icon name="dragHandle" color={palette.inkMuted} />
              </View>
            </Animated.View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

export const UpNextRow = React.memo(UpNextRowContent);

const styles = StyleSheet.create({
  row: {
    height: UP_NEXT_ROW_HEIGHT,
    borderRadius: Radius.md,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: ROW_VERTICAL_PADDING,
    paddingLeft: Space.lg,
    paddingRight: Space.xs,
  },
  shifted: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  removeSlot: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: Space.xs,
    width: REMOVE_SLOT_WIDTH,
    justifyContent: 'center',
  },
  removeButton: {
    width: REMOVE_SLOT_WIDTH,
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
  text: {
    flex: 1,
    minWidth: 0,
  },
  trailing: {
    height: Size.controlMd,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  trailingWithHandle: {
    minWidth: Size.controlMd,
  },
  details: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingRight: Space.md,
  },
  handle: {
    ...StyleSheet.absoluteFill,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  handleTarget: {
    width: Size.controlMd,
    height: Size.controlMd,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
