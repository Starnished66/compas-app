import React, { useRef, useState } from 'react';
import { LibraryEntry, Playlist, RemoteAction } from '../../data/types';
import { BottomSheet } from '../components/BottomSheet';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { SheetActionRow } from '../components/SheetActionRow';
import { SheetStepTitle } from '../components/SheetStepTitle';
import { usePalette } from '../PaletteProvider';
import { playlistDisplayName } from '../playlistName';
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
  /** The listed library entries; the reloaded playlist list confirms a rename or delete. */
  entries?: readonly LibraryEntry[];
}

type OptionsStep = 'options' | 'rename';

export function PlaylistOptionsSheet({
  visible,
  playlist,
  onClose,
  onAction,
  takenNames,
  errorMessage,
  entries,
}: PlaylistOptionsSheetProps) {
  const { t } = useI18n();
  const palette = usePalette();
  const watchForResult = useOptimisticErrorSnackbar(errorMessage, entries);
  const open = visible && playlist != null;
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const { step, setStep, sheetKey } = useSheetStep<OptionsStep>(open, 'options', () => setConfirmingDelete(false));

  const lastPlaylist = useRef<Playlist | null>(playlist);
  if (playlist) lastPlaylist.current = playlist;
  const shownPlaylist = lastPlaylist.current;
  const name = shownPlaylist ? playlistDisplayName(shownPlaylist.name) : '';

  const rename = (newName: string) => {
    if (!playlist) return;
    const shownName = playlistDisplayName(newName.trim());
    watchForResult({
      message: { text: t('Renamed to {name}', { name: newName.trim() }) },
      confirmed: (listed) => Boolean(listed?.some((entry) => entry.playlistKey && playlistDisplayName(entry.title) === shownName)),
    });
    onAction({ type: 'RenamePlaylist', key: playlist.key, name: newName });
    onClose();
  };

  const remove = () => {
    if (!playlist) return;
    const key = playlist.key;
    watchForResult({
      message: { text: t('Deleted {name}', { name }) },
      // Only a reloaded playlist list counts (empty once the last one is gone); track rows carry no playlistKey.
      confirmed: (listed) => Boolean(listed && (listed.length === 0 || listed.some((entry) => entry.playlistKey)) && !listed.some((entry) => entry.playlistKey === key)),
    });
    onAction({ type: 'DeletePlaylist', key });
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
