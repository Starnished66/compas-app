import React, { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { LibraryCategory, LibraryEntry, RemoteAction, RemoteUiState } from '../../data/types';
import { BottomSheet } from '../components/BottomSheet';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { InlineError } from '../components/InlineError';
import { usePalette } from '../PaletteProvider';
import { playlistDisplayName } from '../playlistName';
import { useSnackbar } from '../snackbar/useSnackbar';
import { useEntryArtwork } from '../library/useEntryArtwork';
import { SnackbarMessage } from '../snackbar/snackbarContext';
import { Space } from '../tokens';
import { PendingSongAction, useSongActionPending } from './useSongActionPending';
import { PlaylistMatch, isViewingPlaylist, usePlaylistViewer } from './usePlaylistViewer';
import { useSheetStep } from './useSheetStep';
import { renderSongActionStep } from './songActionPanels';
import { useI18n } from '../../i18n';

export interface SongActionsSheetProps {
  state: RemoteUiState;
  onAction: (action: RemoteAction) => void;
}

type SheetStep = 'actions' | 'playlists' | 'name';

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

  const { confirmed, timedOut } = useSongActionFeedback(stateRef, onAction, snackbar, viewPlaylist, t);
  const { pending, revealed, start, clear } = useSongActionPending(state, onAction, confirmed, timedOut);

  const details = useSongActionDetails(state, visible, pending);
  const { title, playlistName, busy } = details;
  const commands = createSongActionCommands(state, onAction, details, { start, clear, setStep, setDraftName, setConfirmingRemove });
  const { close, removeFromPlaylist } = commands;

  return (
    <>
      <BottomSheet key={sheetKey} visible={visible && (!busy || revealed)} onClose={close} contentKey={step}>
        {renderSongActionStep({
          step, setStep, state, onAction, details, commands, pending, draftName, palette, t, setConfirmingRemove,
        })}
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

type Translate = ReturnType<typeof useI18n>['t'];
type SongAction = SongActionsSheetProps['onAction'];
type StateRef = React.RefObject<RemoteUiState>;
type Snackbar = ReturnType<typeof useSnackbar>;

function showSongRatingFeedback(
  action: Extract<PendingSongAction, { kind: 'rating' }>, stateRef: StateRef,
  onAction: SongAction, snackbar: Snackbar, t: Translate,
) {
  const entryId = action.entryId;
  const undoable = entryId != null && !showsFavorites(stateRef.current);
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
}

function useSongActionFeedback(
  stateRef: StateRef, onAction: SongAction, snackbar: Snackbar,
  viewPlaylist: ReturnType<typeof usePlaylistViewer>, t: Translate,
) {
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
        case 'rating':
          showSongRatingFeedback(action, stateRef, onAction, snackbar, t);
          return;
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
  return { confirmed, timedOut };
}

function useSongActionDetails(state: RemoteUiState, visible: boolean, pending: PendingSongAction | null) {
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

  return { entry, entryArtwork, hasEarlier, hasLater, uniqueEntryId, title, features, stars, rating, canEditPlaylistTrack, playlistName, busy };
}

type SongDetails = ReturnType<typeof useSongActionDetails>;

interface SongCommandControls {
  start: ReturnType<typeof useSongActionPending>['start'];
  clear: ReturnType<typeof useSongActionPending>['clear'];
  setStep: (step: SheetStep) => void;
  setDraftName: (name: string) => void;
  setConfirmingRemove: (show: boolean) => void;
}

function createSongActionCommands(
  state: RemoteUiState, onAction: SongAction, details: SongDetails, controls: SongCommandControls,
) {
  const { title, busy, playlistName, rating, stars, uniqueEntryId } = details;
  const { start, clear, setStep, setDraftName, setConfirmingRemove } = controls;
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

  return { close, run, openPlaylistStep, addToPlaylist, createPlaylist, setRating, movePlaylistTrack, removeFromPlaylist };
}

export interface SongActionView {
  step: SheetStep;
  setStep: (step: SheetStep) => void;
  state: RemoteUiState;
  onAction: SongAction;
  details: SongDetails;
  commands: ReturnType<typeof createSongActionCommands>;
  pending: PendingSongAction | null;
  draftName: string;
  palette: ReturnType<typeof usePalette>;
  t: Translate;
  setConfirmingRemove: (show: boolean) => void;
}

const styles = StyleSheet.create({
  error: {
    paddingHorizontal: Space.lg,
    paddingTop: Space.md,
  },
});
