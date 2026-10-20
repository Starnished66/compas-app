import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { ContentStatus, Playlist, RemoteAction, RemoteUiState } from '../../data/types';
import { AppText } from '../components/AppText';
import { BottomSheet } from '../components/BottomSheet';
import { Button } from '../components/Button';
import { InlineError } from '../components/InlineError';
import { SheetActionRow } from '../components/SheetActionRow';
import { TextField } from '../components/TextField';
import { playlistDisplayName, playlistNameIssue } from '../playlistName';
import { Space } from '../tokens';
import { useI18n } from '../../i18n';

export interface BulkActionsSheetProps {
  visible: boolean;
  ids: string[];
  state: RemoteUiState;
  onAction: (action: RemoteAction) => void;
  onClose: () => void;
}

export function BulkActionsSheet({ visible, ids, state, onAction, onClose }: BulkActionsSheetProps) {
  const { t } = useI18n();
  const [step, setStep] = useState<'actions' | 'playlists' | 'create'>('actions');
  const [name, setName] = useState('');
  const [started, setStarted] = useState(false);
  const canFavorite = state.supportedFeatures.includes('favorites_edit');
  const canEditPlaylists = state.supportedFeatures.includes('playlist_edit');
  const createNameIssue = playlistNameIssue(name.trim(), state.bulkPlaylistOptions?.map((playlist) => playlist.name) ?? []);
  useEffect(() => {
    if (!visible) { setStep('actions'); setName(''); setStarted(false); }
  }, [visible]);
  const run = (action: 'queue' | 'random' | 'favorite' | 'playlist' | 'createPlaylist', extras: { favorite?: boolean; key?: string; name?: string } = {}) => {
    onAction({ type: 'RunBulkAction', ids, action, ...extras });
    setStarted(true);
  };
  const close = () => {
    if (started && (state.bulkActionProgress?.phase === 'resolving' || state.bulkActionProgress?.phase === 'writing')) {
      onAction({ type: 'CancelBulkAction' });
    }
    setStep('actions');
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={close} title={step === 'actions' ? t('{count} selected', { count: ids.length }) : step === 'playlists' ? t('Add to playlist') : t('Create playlist')}>
      {started && state.bulkActionProgress ? (
        <View style={styles.progress}>
          <AppText style={styles.progressText}>{state.bulkActionProgress.phase === 'resolving' ? t('Finding songs…') : state.bulkActionProgress.phase === 'writing' ? t('{completed} of {total} processed', { completed: state.bulkActionProgress.completed, total: state.bulkActionProgress.total }) : state.bulkActionProgress.message ? t(state.bulkActionProgress.message, state.bulkActionProgress.messageValues) : null}</AppText>
          {state.bulkActionProgress.phase === 'resolving' || state.bulkActionProgress.phase === 'writing' ? <Button label={t('Stop')} variant="plain" onPress={() => onAction({ type: 'CancelBulkAction' })} /> : null}
        </View>
      ) : null}
      {started ? (
        state.bulkActionProgress?.phase === 'resolving' || state.bulkActionProgress?.phase === 'writing' ? null : <Button label={t('Done')} onPress={close} />
      ) : step === 'actions' ? (
        <>
          <AppText variant="caption" tone="inkMuted" style={styles.note}>{t('Selected items are from the loaded results.')}</AppText>
          <SheetActionRow icon="queueAdd" label={t('Add to queue')} onPress={() => run('queue')} />
          <SheetActionRow icon="shuffle" label={t('Add one random song to queue')} onPress={() => run('random')} />
          {canFavorite ? <>
            <SheetActionRow icon="heart" label={t('Add to favorites')} onPress={() => run('favorite', { favorite: true })} />
            <SheetActionRow icon="heart" label={t('Remove from favorites')} onPress={() => run('favorite', { favorite: false })} />
          </> : null}
          {canEditPlaylists ? <>
            <SheetActionRow icon="playlistAdd" label={t('Add to playlist')} onPress={() => { setStep('playlists'); onAction({ type: 'LoadBulkPlaylists' }); }} />
            <SheetActionRow icon="plus" label={t('Create playlist')} onPress={() => { setStep('create'); onAction({ type: 'LoadBulkPlaylists' }); }} />
          </> : null}
        </>
      ) : step === 'playlists' ? (
        state.bulkPlaylistOptionsStatus === ContentStatus.Loading ? <AppText style={styles.note}>{t('Loading playlists…')}</AppText> :
          state.bulkPlaylistOptionsStatus === ContentStatus.Error ? <InlineError message={state.connectionMessage || t('Could not load playlists')} /> :
            state.bulkPlaylistOptions?.some((playlist) => playlist.writable) ? state.bulkPlaylistOptions.filter((playlist) => playlist.writable).map((playlist: Playlist) => (
              <SheetActionRow key={playlist.key} icon="playlist" label={playlistDisplayName(playlist.name)} onPress={() => run('playlist', { key: playlist.key })} />
            )) : <AppText style={styles.note}>{t('No writable playlists are available.')}</AppText>
      ) : (
        <View style={styles.create}>
          <TextField value={name} onChangeText={setName} placeholder={t('Playlist name')} accessibilityLabel={t('Playlist name')} autoCapitalize="sentences" />
          {state.bulkPlaylistOptionsStatus === ContentStatus.Error ? <InlineError message={t('Could not load playlists')} /> : null}
          {createNameIssue ? <InlineError message={t(createNameIssue)} /> : null}
          <Button label={t('Create and add songs')} disabled={!name.trim() || Boolean(createNameIssue) || state.bulkPlaylistOptionsStatus !== ContentStatus.Ready} onPress={() => run('createPlaylist', { name: name.trim() })} />
        </View>
      )}
      {step !== 'actions' ? <Button label={t('Back')} variant="plain" onPress={() => setStep('actions')} /> : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  progressText: { flex: 1, flexShrink: 1 },
  note: { paddingHorizontal: Space.lg, paddingVertical: Space.md },
  create: { gap: Space.md, paddingHorizontal: Space.lg, paddingVertical: Space.md },
  progress: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Space.md, paddingHorizontal: Space.lg, paddingVertical: Space.sm },
});
