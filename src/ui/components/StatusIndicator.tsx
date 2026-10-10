import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Palette } from '../palette';
import { usePalette } from '../PaletteProvider';
import { Durations } from '../motion';
import { Radius, Space, Type, TypeVariant } from '../tokens';
import { useColorTransition } from '../useColorTransition';
import { useReducedMotion } from '../useReducedMotion';
import { AppText, TextTone } from './AppText';

export type ConnectionStatus = 'ok' | 'busy' | 'idle' | 'error';

export interface StatusIndicatorProps {
  status: ConnectionStatus;
  label: string;
  pulse?: boolean;
  dotSize?: 'sm' | 'md';
  variant?: TypeVariant;
  tone?: TextTone;
  strong?: boolean;
  numberOfLines?: number;
  style?: StyleProp<ViewStyle>;
}

const DOT_SIZE = { sm: 6, md: 8 } as const;
const PULSE_HALF_PERIOD_MS = Durations.statusPulse / 2;
const PULSE_LOW_OPACITY = 0.3;

export function statusColor(palette: Palette, status: ConnectionStatus): string {
  switch (status) {
    case 'ok':
      return palette.statusOk;
    case 'busy':
      return palette.statusBusy;
    case 'error':
      return palette.statusError;
    default:
      return palette.statusIdle;
  }
}

export function StatusIndicator({
  status,
  label,
  pulse,
  dotSize = 'md',
  variant = 'caption',
  tone = 'ink',
  strong = false,
  numberOfLines = 1,
  style,
}: StatusIndicatorProps) {
  const palette = usePalette();
  const reducedMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(1)).current;
  const pulsing = (pulse ?? status === 'busy') && !reducedMotion;

  useEffect(() => {
    if (!pulsing) return;
    const fade = (toValue: number) =>
      Animated.timing(opacity, {
        toValue,
        duration: PULSE_HALF_PERIOD_MS,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      });
    const loop = Animated.loop(Animated.sequence([fade(PULSE_LOW_OPACITY), fade(1)]));
    loop.start();
    return () => {
      loop.stop();
      opacity.setValue(1);
    };
  }, [opacity, pulsing]);

  const diameter = DOT_SIZE[dotSize];
  const dotColor = useColorTransition(statusColor(palette, status), Durations.statusColor);

  return (
    <View accessible accessibilityRole="text" accessibilityLabel={label} style={[styles.row, style]}>
      <Animated.View style={{ opacity }}>
        <Animated.View
          style={{
            width: diameter,
            height: diameter,
            borderRadius: Radius.full,
            backgroundColor: dotColor,
          }}
        />
      </Animated.View>
      <AppText
        variant={variant}
        tone={tone}
        numberOfLines={numberOfLines}
        style={[styles.label, strong && styles.strongLabel]}
      >
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    minWidth: 0,
  },
  label: {
    flexShrink: 1,
  },
  strongLabel: {
    fontWeight: Type.micro.fontWeight,
  },
});
