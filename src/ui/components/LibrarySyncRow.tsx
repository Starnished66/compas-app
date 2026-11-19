import React from 'react';
import { useCatalogSyncProgress } from '../library/catalogSyncProgressContext';
import { useLibrarySyncRequest } from '../library/useLibrarySyncRequest';
import { useSyncedSongCount } from '../library/useSyncedSongCount';
import { upToDateLabel } from '../library/librarySync';
import { Button } from './Button';
import { ListRow } from './ListRow';
import { StatusIndicator } from './StatusIndicator';
import { useI18n } from '../../i18n';

export interface LibrarySyncRowProps {
  onSync: () => void;
}

export function LibrarySyncRow({ onSync }: LibrarySyncRowProps) {
  const { t } = useI18n();
  const syncMessage = useCatalogSyncProgress();
  const { phase, sync } = useLibrarySyncRequest(syncMessage, onSync);
  const songCount = useSyncedSongCount(syncMessage);
  const unavailable = syncMessage === 'Local catalog unavailable';
  const error = unavailable ? (
    <StatusIndicator status="error" dotSize="sm" variant="caption" tone="inkMuted" label={t('Local catalog unavailable')} numberOfLines={2} />
  ) : undefined;

  const trailing =
    !unavailable && phase === 'syncing' ? (
      <StatusIndicator status="busy" dotSize="sm" variant="caption" tone="inkMuted" label={syncMessage ? `${syncMessage}…` : t('Checking player library…')} />
    ) : phase === 'done' ? (
      <StatusIndicator status="ok" pulse={false} dotSize="sm" variant="caption" tone="inkMuted" label={upToDateLabel(songCount, t)} />
    ) : (
      <Button label={t('Sync now')} variant="plain" size="sm" accessibilityLabel={t('Check the player for library changes')} onPress={sync} />
    );

  return <ListRow variant="action" title={t('Library sync')} subtitle={error} trailing={trailing} />;
}
