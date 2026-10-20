import React, { useRef, useState } from 'react';
import { Playlist, RemoteAction } from '../../data/types';
import { BottomSheet } from '../components/BottomSheet';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { SheetActionRow } from '../components/SheetActionRow';
import { SheetStepTitle } from '../components/SheetStepTitle';
import { usePalette } from '../PaletteProvider';
import { playlistDisplayName } from '../playlistName';
import { useSnackbar } from '../snackbar/useSnackbar';
import { PlaylistNameStep } from './PlaylistNameStep';
import { useOptimisticErrorSnackbar } from './useOptimisticErrorSnackbar';
import { useSheetStep } from './useSheetStep';
import { useI18n } from '../../i18n';

export interface PlaylistOptionsSheetProps {
  visible: boolean;
  playlist: Playlist | null;
  onClose: () => void;
  onAction: (action: RemoteAction) => void;
  takenNames?: readonly string[];
  errorMessage?: string | null;
}

type OptionsStep = 'options' | 'rename';

export function PlaylistOptionsSheet({
  visible,
  playlist,
  onClose,
  onAction,
  takenNames,
  errorMessage,
}: PlaylistOptionsSheetProps) {
  const { t } = useI18n();
  const palette = usePalette();
  const snackbar = useSnackbar();
  const watchForError = useOptimisticErrorSnackbar(errorMessage);
  const open = visible && playlist != null;
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const { step, setStep, sheetKey } = useSheetStep<OptionsStep>(open, 'options', () => setConfirmingDelete(false));

  const lastPlaylist = useRef<Playlist | null>(playlist);
  if (playlist) lastPlaylist.current = playlist;
  const shownPlaylist = lastPlaylist.current;
  const name = shownPlaylist ? playlistDisplayName(shownPlaylist.name) : '';

  const rename = (newName: string) => {
    if (!playlist) return;
    onAction({ type: 'RenamePlaylist', key: playlist.key, name: newName });
    watchForError();
    snackbar.show({ text: `Renamed to ${newName.trim()}` });
    onClose();
  };

  const remove = () => {
    if (!playlist) return;
    onAction({ type: 'DeletePlaylist', key: playlist.key });
    watchForError();
    snackbar.show({ text: `Deleted ${name}` });
    setConfirmingDelete(false);
    onClose();
  };

  return (
    <>
      <BottomSheet key={sheetKey} visible={open} onClose={onClose} contentKey={step}>
        {step === 'rename' ? (
          <PlaylistNameStep
            title={t('Rename playlist')}
            initialName={name}
            confirmLabel={t('Rename')}
            takenNames={takenNames}
            onSubmit={rename}
            onCancel={onClose}
          />
        ) : (
          <>
            <SheetStepTitle title={name} />
            <SheetActionRow icon="pencil" label={t('Rename')} onPress={() => setStep('rename')} />
            <SheetActionRow
              icon="trash"
              iconColor={palette.statusError}
              label={t('Delete playlist')}
              onPress={() => setConfirmingDelete(true)}
            />
          </>
        )}
      </BottomSheet>
      <ConfirmDialog
        visible={open && confirmingDelete}
        title={t('Delete “{name}”?', { name })}
        message={t('The playlist is removed from the player. The songs stay in your library.')}
        confirmLabel={t('Delete playlist')}
        destructive
        onConfirm={remove}
        onClose={() => setConfirmingDelete(false)}
      />
    </>
  );
}
