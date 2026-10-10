import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { songCount } from '../countLabels';
import { usePalette } from '../PaletteProvider';
import { Radius, Size, Space, Type } from '../tokens';
import { AppText } from './AppText';
import { Icon } from './Icon';

export interface NowPlayingFooterProps {
  playerName: string;
  queueTotal: number;
  onOpenConnection: () => void;
  onOpenQueue: () => void;
}

const PLAYER_ICON_SIZE = 18;
const QUEUE_ICON_SIZE = 20;

export function NowPlayingFooter({ playerName, queueTotal, onOpenConnection, onOpenQueue }: NowPlayingFooterProps) {
  const palette = usePalette();
  const name = playerName || 'the player';

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Playing on ${name}. Connection and players`}
        onPress={onOpenConnection}
        style={({ pressed }) => [styles.player, pressed && styles.pressed]}
      >
        <Icon name="player" size={PLAYER_ICON_SIZE} color={palette.inkMuted} />
        <AppText variant="caption" tone="inkMuted" numberOfLines={1} style={styles.playerText}>
          {`Playing on ${name}`}
        </AppText>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Up next, ${songCount(queueTotal)}`}
        onPress={onOpenQueue}
        style={({ pressed }) => [
          styles.queue,
          { backgroundColor: palette.frost, borderColor: palette.outline },
          pressed && styles.pressed,
        ]}
      >
        <Icon name="queue" size={QUEUE_ICON_SIZE} />
        <AppText variant="caption" tabular style={styles.queueText}>
          {songCount(queueTotal)}
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  player: {
    flex: 1,
    minWidth: 0,
    height: Size.controlMd,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  playerText: {
    flexShrink: 1,
    fontWeight: Type.micro.fontWeight,
  },
  queue: {
    height: Size.controlMd,
    paddingLeft: Space.md,
    paddingRight: Space.lg,
    borderRadius: Radius.full,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  queueText: {
    fontWeight: Type.bodyStrong.fontWeight,
  },
  pressed: {
    opacity: 0.7,
  },
});
