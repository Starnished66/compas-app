import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Button } from './Button';
import { AppText } from './AppText';
import { Space } from '../tokens';
import { useI18n } from '../../i18n';

export interface BulkSelectionBarProps {
  count: number;
  onActions: () => void;
  onCancel: () => void;
  label?: string;
}

export function BulkSelectionBar({ count, onActions, onCancel, label = 'selected on this page' }: BulkSelectionBarProps) {
  const { t } = useI18n();
  return (
    <View style={styles.bar}>
      <AppText variant="caption" tone="inkMuted" style={styles.count}>{t(`{count} ${label}`, { count })}</AppText>
      <Button label={t('Actions')} size="sm" onPress={onActions} disabled={!count} />
      <Button label={t('Cancel')} variant="plain" size="sm" onPress={onCancel} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: Space.xs, paddingHorizontal: Space.md },
  count: { flex: 1 },
});
