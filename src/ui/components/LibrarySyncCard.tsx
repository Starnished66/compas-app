import React from 'react';
import { StyleSheet, View } from 'react-native';
import { usePalette } from '../PaletteProvider';
import { Radius, Space } from '../tokens';
import { describeLibrarySync, upToDateLabel } from '../library/librarySync';
import { useSyncedSongCount } from '../library/useSyncedSongCount';
import { AppText } from './AppText';
import { Card } from './Card';
import { EnterView } from './EnterView';
import { IconButton } from './IconButton';
import { ProgressBar } from './ProgressBar';
import { useI18n } from '../../i18n';

export interface LibrarySyncCardProps {
  message?: string | null;
  onRefresh: () => void;
  insetRight?: number;
}

const STATUS_DOT_SIZE = 8;
const REFRESH_ICON_SIZE = 18;

export function LibrarySyncCard({ message, onRefresh, insetRight }: LibrarySyncCardProps) {
  const palette = usePalette();
  const { t } = useI18n();
  const songCount = useSyncedSongCount(message);

  if (!message) {
    return (
      <View style={[styles.doneLine, insetRight != null && { paddingRight: insetRight }]}>
        <View style={[styles.dot, { backgroundColor: palette.statusOk }]} />
        <AppText variant="caption" tone="inkMuted" style={styles.doneText}>
          {upToDateLabel(songCount, t)}
        </AppText>
        <IconButton
          icon="refresh"
          label={t('Reload library')}
          size="sm"
          iconSize={REFRESH_ICON_SIZE}
          color={palette.inkMuted}
          onPress={onRefresh}
        />
      </View>
    );
  }

  const sync = describeLibrarySync(message, t);
  return (
    <EnterView style={[styles.card, insetRight != null && { marginRight: insetRight }]}>
      <Card padded style={styles.cardBody} accessibilityLiveRegion="polite">
        <AppText variant="eyebrow" tone="accent">
          {t('Library sync')}
        </AppText>
        <AppText variant="bodyStrong">{sync.title}</AppText>
        {sync.progress != null ? <ProgressBar value={sync.progress} label={t('Library sync progress')} animated /> : null}
        <AppText variant="caption" tone="inkMuted" tabular>
          {sync.detail}
        </AppText>
      </Card>
    </EnterView>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: Space.md,
    marginHorizontal: Space.lg,
  },
  cardBody: {
    gap: Space.sm,
  },
  doneLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingTop: Space.sm,
    paddingLeft: Space.lg,
    paddingRight: Space.sm,
  },
  dot: {
    width: STATUS_DOT_SIZE,
    height: STATUS_DOT_SIZE,
    borderRadius: Radius.full,
  },
  doneText: {
    flex: 1,
  },
});
