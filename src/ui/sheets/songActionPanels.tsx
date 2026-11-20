import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from '../components/AppText';
import { ArtworkThumb } from '../components/ArtworkThumb';
import { Divider } from '../components/Divider';
import { SheetActionRow } from '../components/SheetActionRow';
import { StarRating } from '../components/StarRating';
import { playlistDisplayName } from '../playlistName';
import { Space } from '../tokens';
import { AddToPlaylistStep } from './AddToPlaylistStep';
import { PlaylistNameStep } from './PlaylistNameStep';
import type { SongActionView } from './SongActionsSheet';

const HEADER_ARTWORK_SIZE = 48;

function renderSongActions(view: SongActionView) {
  const { details, commands, pending, palette, t } = view;
  const { entry, entryArtwork, title, rating, stars, busy, features } = details;
  const { run, setRating, openPlaylistStep } = commands;
  return (
    <>
      <View style={styles.header}>
        <ArtworkThumb uri={entryArtwork} size={HEADER_ARTWORK_SIZE} />
        <View style={styles.headerText}>
          <AppText variant="bodyStrong" numberOfLines={1}>
            {title}
          </AppText>
          {entry?.subtitle ? (
            <AppText variant="caption" tone="inkMuted" numberOfLines={1}>
              {entry.subtitle}
            </AppText>
          ) : null}
        </View>
      </View>
      <Divider />
      <SheetActionRow
        icon="queueAdd"
        label={t('Add to queue')}
        busy={pending?.kind === 'queue'}
        onPress={() => run({ kind: 'queue', title }, { type: 'AddSongToQueue' })}
      />
      {rating != null && stars ? (
        <StarRating rating={rating} onChange={setRating} disabled={busy} busy={pending?.kind === 'rating'} style={styles.rating} />
      ) : rating != null && features.includes('favorites_edit') ? (
        <SheetActionRow
          icon="heart"
          iconFilled={rating > 0}
          iconColor={rating ? palette.accent : undefined}
          label={t(rating ? 'Remove from favorites' : 'Add to favorites')}
          busy={pending?.kind === 'rating'}
          onPress={() => setRating(rating ? 0 : 5)}
        />
      ) : null}
      <SheetActionRow icon="playlistAdd" label={t('Add to playlist…')} onPress={openPlaylistStep} />
      {renderPlaylistTrackActions(view)}
    </>
  );
}

function renderPlaylistTrackActions(view: SongActionView) {
  const { details, commands, pending, palette, t, setConfirmingRemove } = view;
  const { canEditPlaylistTrack, hasEarlier, hasLater, playlistName, busy } = details;
  const { movePlaylistTrack } = commands;
  return (
    <>
      {canEditPlaylistTrack && hasEarlier ? (
        <SheetActionRow
          icon="arrowUp"
          label={t('Move earlier')}
          busy={pending?.kind === 'move' && pending.direction === -1}
          onPress={() => movePlaylistTrack(-1)}
        />
      ) : null}
      {canEditPlaylistTrack && hasLater ? (
        <SheetActionRow
          icon="arrowDown"
          label={t('Move later')}
          busy={pending?.kind === 'move' && pending.direction === 1}
          onPress={() => movePlaylistTrack(1)}
        />
      ) : null}
      {canEditPlaylistTrack ? (
        <SheetActionRow
          icon="trash"
          iconColor={palette.statusError}
          label={t('Remove from {name}', { name: playlistName })}
          busy={pending?.kind === 'remove'}
          onPress={() => {
            if (!busy) setConfirmingRemove(true);
          }}
        />
      ) : null}
    </>
  );
}

export function renderSongActionStep(view: SongActionView) {
  const { state, onAction, step, pending, draftName, t, setStep } = view;
  const { title, busy } = view.details;
  const { addToPlaylist, createPlaylist, close } = view.commands;
  switch (step) {
    case 'playlists':
      return (
        <AddToPlaylistStep
          playlists={state.playlistOptions}
          status={state.playlistOptionsStatus}
          busyKey={pending?.kind === 'playlist' ? pending.key : null}
          onNewPlaylist={() => {
            if (!busy) setStep('name');
          }}
          onSelect={addToPlaylist}
          onRetry={() => onAction({ type: 'LoadSongPlaylists' })}
        />
      );
    case 'name':
      return (
        <PlaylistNameStep
          title={t('New playlist')}
          message={t('Starts with “{title}”', { title })}
          confirmLabel={t('Create')}
          initialName={draftName}
          requireChange={false}
          takenNames={state.playlistOptions.map((option) => playlistDisplayName(option.name))}
          busy={pending?.kind === 'create'}
          onSubmit={createPlaylist}
          onCancel={close}
        />
      );
    default:
      return renderSongActions(view);
  }
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingHorizontal: Space.lg,
    paddingBottom: Space.md,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  rating: { alignSelf: 'center' },
});
