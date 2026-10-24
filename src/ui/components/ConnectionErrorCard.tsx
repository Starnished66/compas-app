import React from 'react';
import { StyleSheet } from 'react-native';
import { Space } from '../tokens';
import { AppText } from './AppText';
import { Button } from './Button';
import { Card } from './Card';
import { StatusIndicator } from './StatusIndicator';
import { useI18n } from '../../i18n';

export interface ConnectionErrorCardProps {
  title: string;
  message: string;
  retryDelaySeconds: number;
  onRetry: () => void;
}

export function ConnectionErrorCard({ title, message, retryDelaySeconds, onRetry }: ConnectionErrorCardProps) {
  const { t } = useI18n();
  const waiting = retryDelaySeconds > 0;

  return (
    <Card variant="surface" padded accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.card}>
      <StatusIndicator status="error" label={title} variant="bodyStrong" />
      <AppText variant="body" tone="inkMuted">
        {message}
      </AppText>
      <Button
        label={waiting ? t('Wait {seconds} s', { seconds: retryDelaySeconds }) : t('Try again')}
        icon="refresh"
        variant="container"
        disabled={waiting}
        onPress={onRetry}
        style={styles.retry}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Space.sm,
  },
  retry: {
    alignSelf: 'flex-start',
    paddingHorizontal: Space.lg,
  },
});
