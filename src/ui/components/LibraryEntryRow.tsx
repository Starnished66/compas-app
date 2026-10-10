import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LibraryEntry } from '../../data/types';
import { usePalette } from '../PaletteProvider';
import { Size, Space } from '../tokens';
import { LibraryEntryKind, displaySubtitle, opensCollection, placeholderIconFor } from '../library/libraryEntryKind';
import { playlistDisplayName } from '../playlistName';
import { ArtworkThumb } from './ArtworkThumb';
import { FlipView } from './FlipView';
import { Icon } from './Icon';
import { ListRow } from './ListRow';
import { ReadOnlyBadge } from './ReadOnlyBadge';
import { TrackRow } from './TrackRow';

export interface LibraryEntryRowProps {
  entry: LibraryEntry;
  kind: LibraryEntryKind;
  number?: number;
  current?: boolean;
  playing?: boolean;
  onPress: (entry: LibraryEntry, kind: LibraryEntryKind) => void;
  onLongPress?: (entry: LibraryEntry, kind: LibraryEntryKind) => void;
  onMore?: (entry: LibraryEntry) => void;
}

const CHEVRON_SIZE = 18;

function LibraryEntryRowContent({ entry, kind, number, current, playing, onPress, onLongPress, onMore }: LibraryEntryRowProps) {
  const palette = usePalette();
  const press = () => onPress(entry, kind);
  const longPress = onLongPress ? () => onLongPress(entry, kind) : undefined;

  if (kind === 'song') {
    return (
      <FlipView flipKey={entry.id}>
        <TrackRow
          title={entry.title}
          subtitle={displaySubtitle(entry) || undefined}
          artworkUri={entry.artwork}
          number={number}
          placeholderIcon="music"
          current={current}
          playing={playing}
          onPress={press}
          onLongPress={longPress}
          onMore={onMore ? () => onMore(entry) : undefined}
          moreLabel={`Song options for ${entry.title}`}
        />
      </FlipView>
    );
  }

  const isPlaylist = kind === 'playlist';
  const showsChevron = opensCollection(kind);
  const readOnly = isPlaylist && !entry.writable;
  const trailing = showsChevron || readOnly ? (
    <View style={styles.trailing}>
      {readOnly ? <ReadOnlyBadge /> : null}
      {showsChevron ? <Icon name="chevronRight" size={CHEVRON_SIZE} color={palette.inkMuted} /> : null}
    </View>
  ) : undefined;

  const radius = kind === 'artist' ? 'full' : 'sm';
  const placeholderIcon = placeholderIconFor(kind);
  return (
    <FlipView flipKey={entry.id}>
      <ListRow
        title={isPlaylist ? playlistDisplayName(entry.title) : entry.title}
        subtitle={displaySubtitle(entry) || undefined}
        leading={
          <FlipView flipKey={entry.id} part="art" artwork={{ uri: entry.artwork, radius, placeholderIcon }}>
            <ArtworkThumb uri={entry.artwork} radius={radius} placeholderIcon={placeholderIcon} />
          </FlipView>
        }
        trailing={trailing}
        onPress={press}
        onLongPress={longPress}
        accessibilityLabel={entry.subtitle ? `${entry.title}, ${displaySubtitle(entry)}` : entry.title}
      />
    </FlipView>
  );
}

export const LibraryEntryRow = React.memo(LibraryEntryRowContent);

const styles = StyleSheet.create({
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    minWidth: Size.controlSm,
    justifyContent: 'flex-end',
    paddingRight: Space.sm,
  },
});
