import React, { useMemo } from 'react';
import { LibraryEntry, RemoteAction } from '../../data/types';
import { useI18n } from '../../i18n';
import { playCollection } from '../library/collectionPlayback';
import { songIds } from '../library/libraryItems';
import { useFirstEntryArtwork } from '../library/useFirstEntryArtwork';
import { localizedCountLabel, localizedEntrySubtitle } from '../localizedLabels';
import { CollectionHeader } from './CollectionHeader';
import { CollectionPlayButtons } from './CollectionPlayButtons';

interface AlbumCollectionHeaderProps {
  album: LibraryEntry;
  entries: LibraryEntry[];
  countLabel?: string | null;
  busy?: boolean;
  shuffleActive: boolean;
  nativePlayback: boolean;
  onAction: (action: RemoteAction) => void;
}

export function AlbumCollectionHeader({
  album, entries, countLabel, busy, shuffleActive, nativePlayback, onAction,
}: AlbumCollectionHeaderProps) {
  const { t } = useI18n();
  const artworkUri = useFirstEntryArtwork(entries, album);
  const ids = useMemo(() => songIds(entries), [entries]);
  return (
    <CollectionHeader
      eyebrow={t('Album')}
      title={album.title}
      subtitle={localizedEntrySubtitle(album, t)}
      meta={localizedCountLabel(countLabel, t) || undefined}
      artworkUri={artworkUri}
      actions={ids.length || nativePlayback ? (
        <CollectionPlayButtons
          busy={busy}
          onPlay={() => playCollection(onAction, ids, false, shuffleActive, nativePlayback)}
          onShuffle={() => playCollection(onAction, ids, true, shuffleActive, nativePlayback)}
        />
      ) : undefined}
    />
  );
}
