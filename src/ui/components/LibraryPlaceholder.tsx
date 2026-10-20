import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Space } from '../tokens';
import { AppText } from './AppText';
import { Button } from './Button';
import { Spinner } from './Spinner';
import { useI18n } from '../../i18n';

export interface LibraryPlaceholderProps {
  title: string;
  body?: string;
  loading?: boolean;
  actionLabel?: string;
  onAction?: () => void;
}

const SPINNER_SIZE = 24;

export function LibraryPlaceholder({ title, body, loading = false, actionLabel, onAction }: LibraryPlaceholderProps) {
  const { t } = useI18n();
  const noResults = title.match(/^No results for “(.*)”$/);
  const displayTitle = noResults ? t('No results for “{term}”', { term: noResults[1] }) : t(title);
  return (
    <View style={styles.container} accessibilityLiveRegion="polite">
      {loading ? <Spinner size={SPINNER_SIZE} /> : null}
      <AppText variant="bodyStrong" style={styles.centered}>
        {displayTitle}
      </AppText>
      {body ? (
        <AppText variant="body" tone="inkMuted" style={styles.centered}>
          {body ? t(body) : null}
        </AppText>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={t(actionLabel)} variant="raised" onPress={onAction} style={styles.action} />
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
