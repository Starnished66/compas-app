import React from 'react';
import { Animated, Pressable, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { ConnectionStatus, ConnectionTransport } from '../../data/types';
import { PlayerStatusPhase, usePlayerStatusMotion } from '../chrome/usePlayerStatusMotion';
import { connectionStatusDescription, connectionStatusKind } from '../connectionStatusDisplay';
import { usePalette } from '../PaletteProvider';
import { Radius, Size } from '../tokens';
import { CometRing } from './CometRing';
import { Icon } from './Icon';
import { statusColor } from './StatusIndicator';
import { useI18n } from '../../i18n';

export interface PlayerButtonProps {
  status: ConnectionStatus;
  transport: ConnectionTransport;
  playerName: string;
  pinRequired?: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}

const PLAYER_ICON_SIZE = 24;
const BORDER_WIDTH = 1;
const RING_WIDTH = 1;
const RING_SIZE = Size.bar - 2 * BORDER_WIDTH;
const RING_RADIUS = Radius.lg - BORDER_WIDTH;
const RIPPLE_SIZE = 10;

function statusPhase(status: ConnectionStatus, pinRequired: boolean): PlayerStatusPhase {
  if (pinRequired || status === ConnectionStatus.Connecting) return 'busy';
  if (status === ConnectionStatus.Connected) return 'connected';
  if (status === ConnectionStatus.Error) return 'error';
  return 'offline';
}

export function PlayerButton({ status, transport, playerName, pinRequired = false, onPress, style }: PlayerButtonProps) {
  const { t } = useI18n();
  const palette = usePalette();
  const phase = statusPhase(status, pinRequired);
  const busy = phase === 'busy';
  const color = busy ? palette.statusBusy : statusColor(palette, connectionStatusKind(status));
  const label = pinRequired ? t('PIN needed') : connectionStatusDescription(status, transport, playerName, t);
  const { buttonStyle, iconStyle, rippleStyle } = usePlayerStatusMotion(phase);
  const borderColor = busy || phase === 'connected' ? palette.outline : color;

  return (
    <Animated.View style={[buttonStyle, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ busy }}
        onPress={onPress}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: palette.frost, borderColor },
          pressed && styles.pressed,
        ]}
      >
        <Animated.View pointerEvents="none" style={[styles.ripple, { backgroundColor: color }, rippleStyle]} />
        <Animated.View style={iconStyle}>
          <Icon name="playerScreen" size={PLAYER_ICON_SIZE} color={palette.inkMuted} />
        </Animated.View>
        <CometRing
          size={RING_SIZE}
          radius={RING_RADIUS}
          strokeWidth={RING_WIDTH}
          color={color}
          busy={busy}
          style={styles.ring}
        />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: {
    width: Size.bar,
    height: Size.bar,
    borderWidth: BORDER_WIDTH,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    transform: [{ scale: 0.92 }],
  },
  ripple: {
    position: 'absolute',
    width: RIPPLE_SIZE,
    height: RIPPLE_SIZE,
    borderRadius: RIPPLE_SIZE / 2,
  },
  ring: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
});
