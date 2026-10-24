import React from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { ContentStatus } from '../../data/types';
import { Space } from '../tokens';
import { AppText } from './AppText';
import { CardSection } from './CardSection';
import { Spinner } from './Spinner';
import { useI18n } from '../../i18n';

export interface UpNextFooterProps {
  hasRows: boolean;
  status: ContentStatus;
  loadingMore: boolean;
  hasMore: boolean;
  onLayout?: (event: LayoutChangeEvent) => void;
}

export function UpNextFooter({ hasRows, status, loadingMore, hasMore, onLayout }: UpNextFooterProps) {
  const { t } = useI18n();
  const emptyContent =
    status === ContentStatus.Loading ? (
      <View style={styles.emptyRow}>
        <Spinner />
        <AppText variant="body" tone="inkMuted">
          {t('Loading the queue…')}
        </AppText>
      </View>
    ) : (
      <AppText variant="body" tone="inkMuted" style={styles.emptyText}>
        {status === ContentStatus.Error
          ? t('Couldn’t load the queue from the player.')
          : t('Nothing else is queued. Add songs from their menu in the Library.')}
      </AppText>
    );

  return (
    <CardSection edge="bottom" style={styles.section} onLayout={onLayout}>
      {hasRows ? null : emptyContent}
      {loadingMore ? (
        <View style={styles.loadingMore}>
          <Spinner />
        </View>
      ) : hasRows && !hasMore ? (
        <AppText variant="caption" tone="inkMuted" style={styles.endOfQueue}>
          {t('End of queue')}
        </AppText>
      ) : null}
    </CardSection>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingBottom: Space.sm,
  },
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.xl,
    paddingHorizontal: Space.lg,
  },
  emptyText: {
    paddingVertical: Space.xl,
    paddingHorizontal: Space.lg,
  },
  loadingMore: {
    alignItems: 'center',
    paddingVertical: Space.md,
  },
  endOfQueue: {
    textAlign: 'center',
    paddingTop: Space.md,
    paddingBottom: Space.sm,
    paddingHorizontal: Space.lg,
  },
});
