import React from 'react';
import { StyleSheet } from 'react-native';
import { RemoteAction } from '../../data/types';
import { AppText } from '../components/AppText';
import { BottomSheet } from '../components/BottomSheet';
import { SheetActionRow } from '../components/SheetActionRow';
import { SheetStepTitle } from '../components/SheetStepTitle';
import { Space } from '../tokens';
import { useI18n } from '../../i18n';
import { PlaylistNameStep } from './PlaylistNameStep';
import { useSheetStep } from './useSheetStep';

export interface NewPlaylistSheetProps {
  visible: boolean;
  onClose: () => void;
  onAction: (action: RemoteAction) => void;
  canImport: boolean;
  canCreateEmpty?: boolean;
  takenNames?: readonly string[];
}

type SheetStep = 'options' | 'empty' | 'import';

export function NewPlaylistSheet({
  visible,
  onClose,
  onAction,
  canImport,
  canCreateEmpty = true,
  takenNames,
}: NewPlaylistSheetProps) {
  const { t } = useI18n();
  const { step, setStep, sheetKey } = useSheetStep<SheetStep>(visible, 'options');

  const submitName = (name: string) => {
    onAction(step === 'import' ? { type: 'ImportPlaylist', name } : { type: 'CreateEmptyPlaylist', name });
    onClose();
  };

  const renderStep = () => {
    if (step === 'options') {
      return (
        <>
          <SheetStepTitle title={t('New playlist')} />
          <SheetActionRow
            icon="playlistAdd"
            label={t('Empty playlist')}
            subtitle={t(canCreateEmpty ? 'Name it now, add songs later' : 'This player can’t create empty playlists')}
            disabled={!canCreateEmpty}
            onPress={() => setStep('empty')}
          />
          <SheetActionRow
            icon="import"
            label={t('Import a playlist file')}
            subtitle={t(canImport ? 'M3U or M3U8 from this phone, up to 256 KB' : 'This player can’t import playlist files')}
            disabled={!canImport}
            onPress={() => setStep('import')}
          />
          <AppText variant="caption" tone="inkMuted" style={styles.footnote}>
            {t('You can also start a playlist from any song. Open its menu and choose Add to playlist.')}
          </AppText>
        </>
      );
    }
    const importing = step === 'import';
    return (
      <PlaylistNameStep
        title={t(importing ? 'Name the playlist' : 'New playlist')}
        message={importing ? t('Next, choose an M3U or M3U8 file. Songs are matched to what’s on the player.') : undefined}
        confirmLabel={t(importing ? 'Choose file' : 'Create')}
        takenNames={takenNames}
        onSubmit={submitName}
        onCancel={onClose}
      />
    );
  };

  return (
    <BottomSheet key={sheetKey} visible={visible} onClose={onClose} contentKey={step}>
      {renderStep()}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  footnote: {
    paddingHorizontal: Space.lg,
    paddingTop: Space.sm,
  },
});
