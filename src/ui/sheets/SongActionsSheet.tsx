import React, { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { LibraryCategory, LibraryEntry, RemoteAction, RemoteUiState } from '../../data/types';
import { AppText } from '../components/AppText';
import { ArtworkThumb } from '../components/ArtworkThumb';
import { BottomSheet } from '../components/BottomSheet';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Divider } from '../components/Divider';
import { InlineError } from '../components/InlineError';
import { StarRating } from '../components/StarRating';
import { SheetActionRow } from '../components/SheetActionRow';
import { usePalette } from '../PaletteProvider';
import { playlistDisplayName } from '../playlistName';
import { useSnackbar } from '../snackbar/useSnackbar';
import { useEntryArtwork } from '../library/useEntryArtwork';
import { SnackbarMessage } from '../snackbar/snackbarContext';
import { Space } from '../tokens';
import { AddToPlaylistStep } from './AddToPlaylistStep';
import { PlaylistNameStep } from './PlaylistNameStep';
import { PendingSongAction, useSongActionPending } from './useSongActionPending';
import { PlaylistMatch, isViewingPlaylist, usePlaylistViewer } from './usePlaylistViewer';
import { useSheetStep } from './useSheetStep';
import { useI18n } from '../../i18n';

export interface SongActionsSheetProps {
  state: RemoteUiState;
  onAction: (action: RemoteAction) => void;
}

type SheetStep = 'actions' | 'playlists' | 'name';

const HEADER_ARTWORK_SIZE = 48;

function findSongEntries(entries: readonly LibraryEntry[], title: string, position: number | null | undefined): LibraryEntry[] {
  return entries.filter(
    (entry) =>
      entry.kind === 'song' &&
      entry.title === title &&
      (position == null || entry.playlistPosition === position),
  );
}

function playlistNeighbours(entries: readonly LibraryEntry[], position: number | null | undefined) {
  const positions = entries
    .map((entry) => entry.playlistPosition)
    .filter((value): value is number => value != null);
  return {
    hasEarlier: position != null && positions.some((value) => value < position),
    hasLater: position != null && positions.some((value) => value > position),
  };
}

interface SongEntryLookup {
  matches: LibraryEntry[];
  hasEarlier: boolean;
  hasLater: boolean;
}

const NO_LOOKUP: SongEntryLookup = { matches: [], hasEarlier: false, hasLater: false };

function showsFavorites(state: RemoteUiState): boolean {
  return state.screen.type === 'Library' && state.screen.category === LibraryCategory.Favorites;
}

function setRatingFor(onAction: (action: RemoteAction) => void, entryId: string, rating: number) {
  onAction({ type: 'OpenSongActions', id: entryId });
  onAction({ type: 'SetSongRating', rating });
  onAction({ type: 'CloseSongActions' });
}

export function SongActionsSheet({ state, onAction }: SongActionsSheetProps) {
  const { t } = useI18n();
  const palette = usePalette();
  const snackbar = useSnackbar();
  const visible = state.songActionsVisible;
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [draftName, setDraftName] = useState('');
  const { step, setStep, sheetKey } = useSheetStep<SheetStep>(visible, 'actions', () => {
    setConfirmingRemove(false);
    setDraftName('');
  });
  const stateRef = useRef(state);
  stateRef.current = state;
  const viewPlaylist = usePlaylistViewer(state, onAction);

  const confirmed = useCallback(
    (action: PendingSongAction) => {
      const latest = stateRef.current;
      const view = (match: PlaylistMatch): Pick<SnackbarMessage, 'actionLabel' | 'onAction'> => ({
        actionLabel: t('View'),
        onAction: () => viewPlaylist(match),
      });
      switch (action.kind) {
        case 'queue':
          snackbar.show({ text: t('Added to queue') });
          return;
        case 'playlist':
          snackbar.show({
            text: t('Added to {name}', { name: action.playlistName }),
            ...(isViewingPlaylist(latest, action.key) ? {} : view({ key: action.key })),
          });
          return;
        case 'create':
          snackbar.show({
            text: t('Created {name} with “{title}”', { name: action.playlistName, title: action.title }),
            ...view({ name: action.playlistName }),
          });
          return;
        case 'rating': {
          const entryId = action.entryId;
          const undoable = entryId != null && !showsFavorites(latest);
          snackbar.show({
            text: action.stars
              ? (action.rating ? t('Rating saved') : t('Rating cleared'))
              : action.rating ? t('Added to favorites') : t('Removed from favorites'),
            ...(undoable
              ? {
                  actionLabel: t('Undo'),
                  onAction: () => {
                    if (stateRef.current.libraryEntries.some((entry) => entry.id === entryId)) {
                      setRatingFor(onAction, entryId, action.previous);
                    }
                  },
                }
              : {}),
          });
          return;
        }
        case 'remove':
          snackbar.show({ text: t('Removed from {name}', { name: action.playlistName }) });
          return;
        case 'move':
          return;
      }
    },
    [onAction, snackbar, viewPlaylist, t],
  );

  const timedOut = useCallback(
    () => snackbar.show({ text: t('No response from the player. Check whether the change was applied.') }),
    [snackbar, t],
  );
  const { pending, revealed, start, clear } = useSongActionPending(state, onAction, confirmed, timedOut);

  // The library scans only run while the sheet is open; while it closes the last result is kept so the
  // header and move rows don't change mid-animation.
  const { libraryEntries, songActionTitle, songActionPosition } = state;
  const lastLookup = useRef<SongEntryLookup>(NO_LOOKUP);
  const lookup = useMemo(
    () => visible
      ? { matches: findSongEntries(libraryEntries, songActionTitle, songActionPosition), ...playlistNeighbours(libraryEntries, songActionPosition) }
      : lastLookup.current,
    [visible, libraryEntries, songActionTitle, songActionPosition],
  );
  lastLookup.current = lookup;
  const { matches, hasEarlier, hasLater } = lookup;
  const entry = matches[0];
  const entryArtwork = useEntryArtwork(entry);
  const uniqueEntryId = matches.length === 1 ? matches[0].id : null;
  const title = state.songActionTitle;
  const features = state.supportedFeatures;
  const stars = features.includes('ratings_edit');
  const rating = state.songActionRating;
  const playlist = state.activePlaylist;
  const canEditPlaylistTrack = Boolean(
    playlist?.writable && state.playlistRevision && state.songActionPosition != null && features.includes('playlist_edit'),
  );
  const playlistName = playlist ? playlistDisplayName(playlist.name) : '';
  const busy = pending != null;

  const close = () => {
    clear();
    onAction({ type: 'CloseSongActions' });
  };

  const run = (action: PendingSongAction, request: RemoteAction) => {
    if (!busy) start(action, request);
  };

  const openPlaylistStep = () => {
    if (busy) return;
    onAction({ type: 'LoadSongPlaylists' });
    setStep('playlists');
  };

  const addToPlaylist = (key: string) => {
    const option = state.playlistOptions.find((candidate) => candidate.key === key);
    const name = option ? playlistDisplayName(option.name) : 'playlist';
    run({ kind: 'playlist', title, key, playlistName: name }, { type: 'AddSongToPlaylist', key });
  };

  const createPlaylist = (name: string) => {
    setDraftName(name);
    run({ kind: 'create', title, playlistName: name.trim() }, { type: 'CreatePlaylistWithSong', name });
  };

  const setRating = (next: number) => {
    if (rating == null) return;
    run({ kind: 'rating', title, rating: next, previous: rating, stars, entryId: uniqueEntryId }, { type: 'SetSongRating', rating: next });
  };

  const movePlaylistTrack = (direction: -1 | 1) =>
    run({ kind: 'move', title, direction }, { type: 'MovePlaylistTrack', direction });

  const removeFromPlaylist = () => {
    setConfirmingRemove(false);
    run({ kind: 'remove', title, playlistName }, { type: 'RemovePlaylistTrack' });
  };

  const renderActions = () => (
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

  const renderStep = () => {
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
        return renderActions();
    }
  };

  return (
    <>
      <BottomSheet key={sheetKey} visible={visible && (!busy || revealed)} onClose={close} contentKey={step}>
        {renderStep()}
        {state.connectionMessage ? <InlineError message={state.connectionMessage} style={styles.error} /> : null}
      </BottomSheet>
      <ConfirmDialog
        visible={visible && confirmingRemove}
        title={t('Remove from {name}?', { name: playlistName })}
        message={t('“{title}” is removed from this playlist. It stays in your library.', { title })}
        confirmLabel={t('Remove')}
        destructive
        onConfirm={removeFromPlaylist}
        onClose={() => setConfirmingRemove(false)}
      />
    </>
  );
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
  error: {
    paddingHorizontal: Space.lg,
    paddingTop: Space.md,
  },
});
