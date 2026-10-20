import React, { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Size, Space } from '../tokens';
import { AppText } from './AppText';
import { IconButton } from './IconButton';
import { useI18n } from '../../i18n';

export interface ScreenTitleBarProps {
  title?: string;
  backLabel?: string;
  onBack?: () => void;
  trailing?: ReactNode;
}

const BACK_BUTTON_OFFSET = -Space.md;

export function ScreenTitleBar({ title, backLabel, onBack, trailing }: ScreenTitleBarProps) {
  const { t } = useI18n();
  return (
    <View style={styles.bar}>
      {onBack ? (
        <IconButton icon="chevronLeft" label={backLabel ?? t('Back')} onPress={onBack} style={styles.back} />
      ) : null}
      {backLabel ? (
        <AppText variant="bodyStrong" tone="inkMuted" numberOfLines={1}>
          {backLabel}
        </AppText>
      ) : null}
      {title ? (
        <AppText variant="title" accessibilityRole="header" numberOfLines={1} style={styles.title}>
          {title}
        </AppText>
      ) : (
        <View style={styles.title} />
      )}
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: Size.bar,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.lg,
  },
  back: {
    marginLeft: BACK_BUTTON_OFFSET,
  },
  title: {
    flex: 1,
    minWidth: 0,
  },
});
