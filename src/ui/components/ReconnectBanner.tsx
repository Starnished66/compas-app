import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Space } from '../tokens';
import { AppText } from './AppText';
import { Card } from './Card';
import { Spinner } from './Spinner';
import { useI18n } from '../../i18n';

export interface ReconnectBannerProps {
  playerName: string;
  style?: StyleProp<ViewStyle>;
}

export const RECONNECT_BANNER_HEIGHT = 76;
const TEXT_GAP = 2;

export function ReconnectBanner({ playerName, style }: ReconnectBannerProps) {
  const { t } = useI18n();
  return (
    <Card accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.card, style]}>
      <Spinner />
      <View style={styles.text}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {playerName ? t('Reconnecting to {name}…', { name: playerName }) : t('Reconnecting to the player…')}
        </AppText>
        <AppText variant="caption" tone="inkMuted" numberOfLines={2}>
          {t('Showing the last reading from the player. Controls come back when it answers.')}
        </AppText>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: RECONNECT_BANNER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.md,
    paddingHorizontal: Space.lg,
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: TEXT_GAP,
  },
});
