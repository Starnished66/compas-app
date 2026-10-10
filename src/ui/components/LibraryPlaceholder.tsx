import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Space } from '../tokens';
import { AppText } from './AppText';
import { Button } from './Button';
import { Spinner } from './Spinner';

export interface LibraryPlaceholderProps {
  title: string;
  body?: string;
  loading?: boolean;
  actionLabel?: string;
  onAction?: () => void;
}

const SPINNER_SIZE = 24;

export function LibraryPlaceholder({ title, body, loading = false, actionLabel, onAction }: LibraryPlaceholderProps) {
  return (
    <View style={styles.container} accessibilityLiveRegion="polite">
      {loading ? <Spinner size={SPINNER_SIZE} /> : null}
      <AppText variant="bodyStrong" style={styles.centered}>
        {title}
      </AppText>
      {body ? (
        <AppText variant="body" tone="inkMuted" style={styles.centered}>
          {body}
        </AppText>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} variant="raised" onPress={onAction} style={styles.action} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: Space.xs,
    paddingVertical: Space.xl * 2,
    paddingHorizontal: Space.xl,
  },
  centered: {
    textAlign: 'center',
  },
  action: {
    marginTop: Space.md,
  },
});
