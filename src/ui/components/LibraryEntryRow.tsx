import React from 'react';
import { useI18n } from '../../i18n';
import { localizedEntrySubtitle } from '../localizedLabels';
import { StyleSheet, View } from 'react-native';
import { LibraryEntry } from '../../data/types';
import { usePalette } from '../PaletteProvider';
import { Size, Space } from '../tokens';
import { LibraryEntryKind, displaySubtitle, opensCollection, placeholderIconFor } from '../library/libraryEntryKind';
import { useEntryArtwork } from '../library/useEntryArtwork';
import { playlistDisplayName } from '../playlistName';
import { ArtworkThumb } from './ArtworkThumb';
import { FlipView } from './FlipView';
import { Icon } from './Icon';
import { ListRow } from './ListRow';
import { ReadOnlyBadge } from './ReadOnlyBadge';
import { StarRating } from './StarRating';
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
  selectionMode?: boolean;
  selected?: boolean;
  onSelect?: (entry: LibraryEntry, kind: LibraryEntryKind) => void;
  disabled?: boolean;
}

const CHEVRON_SIZE = 18;

function LibraryEntryRowContent(props: LibraryEntryRowProps) {
  const { entry, kind, number, current, playing, onPress, onLongPress, onMore, selectionMode = false, selected = false, onSelect, disabled = false } = props;
  const palette = usePalette();
  const { t } = useI18n();
  const subtitle = localizedEntrySubtitle(entry, t);
  const artworkUri = useEntryArtwork(entry);
  const press = () => {
    if (disabled) return;
    if (selectionMode) onSelect?.(entry, kind);
    else onPress(entry, kind);
  };
  const longPress = selectionMode ? () => onSelect?.(entry, kind) : onLongPress ? () => onLongPress(entry, kind) : undefined;

  if (kind === 'song') {
    return (
      <FlipView flipKey={entry.id}>
        <TrackRow
          title={entry.title}
          subtitle={subtitle || undefined}
          artworkUri={artworkUri}
          number={number}
          placeholderIcon="music"
          current={current}
          playing={playing}
          onPress={press}
          onLongPress={longPress}
          onMore={!selectionMode && onMore ? () => onMore(entry) : undefined}
          selected={selectionMode ? selected : undefined}
          accessory={selectionMode ? <Icon name={selected ? 'check' : 'selectionCircle'} /> : undefined}
          moreLabel={t('Song options for {title}', { title: entry.title })}
        />
      </FlipView>
    );
  }

  return renderCollectionRow(props, { palette, t, subtitle, artworkUri, press, longPress });
}

interface CollectionRowView {
  palette: ReturnType<typeof usePalette>;
  t: ReturnType<typeof useI18n>['t'];
  subtitle: ReturnType<typeof localizedEntrySubtitle>;
  artworkUri: ReturnType<typeof useEntryArtwork>;
  press: () => void;
  longPress?: () => void;
}

function renderCollectionRow(
  { entry, kind, selectionMode = false, selected = false, disabled = false }: LibraryEntryRowProps,
  { palette, t, subtitle, artworkUri, press, longPress }: CollectionRowView,
) {
  const isPlaylist = kind === 'playlist';
  const showsChevron = opensCollection(kind);
  const readOnly = isPlaylist && !entry.writable;
  const stars = entry.stars;
  const accessory = selectionMode ? (
    <Icon name={selected ? 'check' : 'selectionCircle'} />
  ) : (
    <>
      {readOnly ? <ReadOnlyBadge /> : null}
      {showsChevron ? <Icon name="chevronRight" size={CHEVRON_SIZE} color={palette.inkMuted} /> : null}
    </>
  );
  const trailing = selectionMode && stars == null ? accessory : showsChevron || readOnly || stars != null ? (
    <View style={styles.trailing}>
      {stars != null ? <StarRating rating={stars} /> : null}
      {accessory}
    </View>
  ) : undefined;
  const accessibilityLabel = [
    entry.title, subtitle, stars == null ? null : t('{count} stars', { count: stars }),
  ].filter(Boolean).join(', ');

  const radius = kind === 'artist' ? 'full' : 'sm';
  const placeholderIcon = placeholderIconFor(kind);
  return (
    <FlipView flipKey={entry.id}>
      <ListRow
        title={isPlaylist ? playlistDisplayName(entry.title) : entry.title}
        subtitle={subtitle || undefined}
        leading={
          <FlipView flipKey={entry.id} part="art" artwork={{ uri: artworkUri, radius, placeholderIcon }}>
            <ArtworkThumb uri={artworkUri} radius={radius} placeholderIcon={placeholderIcon} />
          </FlipView>
        }
        trailing={trailing}
        onPress={press}
        onLongPress={longPress}
        disabled={disabled}
        selected={selectionMode && selected}
        accessibilityLabel={accessibilityLabel}
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
