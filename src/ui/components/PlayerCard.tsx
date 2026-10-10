import React, { ReactNode } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { ConnectionStatusView } from '../connectionSummary';
import { usePalette } from '../PaletteProvider';
import { Radius, Size, Space } from '../tokens';
import { AppText } from './AppText';
import { Card } from './Card';
import { Icon } from './Icon';
import { StatusIndicator } from './StatusIndicator';

export interface PlayerCardProps {
  name: string;
  detail?: string;
  status?: ConnectionStatusView;
  trailing?: ReactNode;
  children?: ReactNode;
  variant?: 'card' | 'row';
  style?: StyleProp<ViewStyle>;
}

export function PlayerCard({ name, detail, status, trailing, children, variant = 'card', style }: PlayerCardProps) {
  const palette = usePalette();
  const subtitle = status ? [status.label, detail].filter(Boolean).join(' · ') : detail;

  const identity = (
    <View style={styles.identity}>
      <View style={[styles.iconTile, { backgroundColor: palette.surfaceRaised }]}>
        <Icon name="player" />
      </View>
      <View style={styles.text}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {name}
        </AppText>
        {status ? (
          <StatusIndicator status={status.status} label={subtitle ?? ''} dotSize="sm" tone="inkMuted" />
        ) : subtitle ? (
          <AppText variant="caption" tone="inkMuted" tabular numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {trailing}
    </View>
  );

  if (variant === 'row') return <View style={[styles.row, style]}>{identity}</View>;

  return (
    <Card variant="surface" padded style={[styles.card, style]}>
      {identity}
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Space.md,
  },
  row: {
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  iconTile: {
    width: Size.controlMd,
    height: Size.controlMd,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
});
