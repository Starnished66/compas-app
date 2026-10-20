import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ContentStatus, Playlist } from '../../data/types';
import { AppText } from '../components/AppText';
import { ArtworkThumb } from '../components/ArtworkThumb';
import { useI18n } from '../../i18n';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { ListRow } from '../components/ListRow';
import { SectionHeader } from '../components/SectionHeader';
import { SheetStepTitle } from '../components/SheetStepTitle';
import { Spinner } from '../components/Spinner';
import { usePalette } from '../PaletteProvider';
import { playlistDisplayName } from '../playlistName';
import { Radius, Size, Space } from '../tokens';

export interface AddToPlaylistStepProps {
  playlists: Playlist[];
  status: ContentStatus;
  onNewPlaylist: () => void;
  onSelect: (key: string) => void;
  onRetry: () => void;
  busyKey?: string | null;
}

const TILE_ICON_SIZE = 20;
const TILE_ICON_STROKE = 2;

export function AddToPlaylistStep({
  playlists,
  status,
  onNewPlaylist,
  onSelect,
  onRetry,
  busyKey = null,
}: AddToPlaylistStepProps) {
  const { t } = useI18n();
  const palette = usePalette();
  const loading = status === ContentStatus.Loading;
  const failed = status === ContentStatus.Error;

  return (
    <View>
      <SheetStepTitle title={t('Add to playlist')} />
      <ListRow
        title={t('New playlist')}
        onPress={onNewPlaylist}
        leading={
          <View style={[styles.tile, { backgroundColor: palette.accentContainer }]}>
            <Icon name="plus" size={TILE_ICON_SIZE} strokeWidth={TILE_ICON_STROKE} color={palette.onAccentContainer} />
          </View>
        }
      />
      <SectionHeader label={t('Your playlists')} tone="muted" style={styles.sectionHeader} />
      {loading ? (
        <View style={styles.state}>
          <Spinner />
          <AppText variant="body" tone="inkMuted">
            {t('Loading playlists…')}
          </AppText>
        </View>
      ) : null}
      {failed ? (
        <View style={styles.state}>
          <AppText variant="body" tone="inkMuted">
            {t('Couldn’t load your playlists.')}
          </AppText>
          <Button label={t('Try again')} variant="raised" size="sm" onPress={onRetry} />
        </View>
      ) : null}
      {!loading && !failed && playlists.length === 0 ? (
        <AppText variant="body" tone="inkMuted" style={styles.empty}>
          {t('No playlists yet. Start one with New playlist.')}
        </AppText>
      ) : null}
      {playlists.map((playlist) => (
        <ListRow
          key={playlist.key}
          title={playlistDisplayName(playlist.name)}
          onPress={() => onSelect(playlist.key)}
          trailing={busyKey === playlist.key ? <Spinner style={styles.rowSpinner} /> : undefined}
          leading={<ArtworkThumb size={Size.rowArtwork} placeholderIcon="playlist" />}
        />
      ))}
      <AppText variant="caption" tone="inkMuted" style={styles.footnote}>
        {t('Playlists the player made itself, like Most Played, can’t be changed and aren’t listed.')}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: Size.rowArtwork,
    height: Size.rowArtwork,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeader: {
    marginTop: Space.xs,
  },
  state: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
  },
  empty: {
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
  },
  rowSpinner: {
    marginRight: Space.md,
  },
  footnote: {
    paddingHorizontal: Space.lg,
    paddingTop: Space.sm,
  },
});
