import React from 'react';
import { useLibrarySyncRequest } from '../library/useLibrarySyncRequest';
import { useSyncedSongCount } from '../library/useSyncedSongCount';
import { upToDateLabel } from '../library/librarySync';
import { Button } from './Button';
import { ListRow } from './ListRow';
import { StatusIndicator } from './StatusIndicator';

export interface LibrarySyncRowProps {
  syncMessage?: string | null;
  onSync: () => void;
}

export function LibrarySyncRow({ syncMessage, onSync }: LibrarySyncRowProps) {
  const { phase, sync } = useLibrarySyncRequest(syncMessage, onSync);
  const songCount = useSyncedSongCount(syncMessage ?? null);

  const trailing =
    phase === 'syncing' ? (
      <StatusIndicator status="busy" dotSize="sm" variant="caption" tone="inkMuted" label={`${syncMessage || 'Checking player library'}…`} />
    ) : phase === 'done' ? (
      <StatusIndicator status="ok" pulse={false} dotSize="sm" variant="caption" tone="inkMuted" label={upToDateLabel(songCount)} />
    ) : (
      <Button label="Sync now" variant="plain" size="sm" accessibilityLabel="Check the player for library changes" onPress={sync} />
    );

  return <ListRow variant="action" title="Library sync" trailing={trailing} />;
}
