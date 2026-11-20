import React from 'react';
import { ConnectionStatus, type LibraryEntry, type Playlist, type RemoteAction, type RemoteUiState } from '../../data/types';
import type { useI18n } from '../../i18n';
import { TOP_RATED_ALBUMS_ROW } from '../../session/libraryCategoryLoader';
import { isShuffleMode } from '../../session/playbackModes';
import { playCollection } from '../library/collectionPlayback';
import { nodeItem, songIds, type LibraryItem } from '../library/libraryItems';
import { AlbumCollectionHeader } from '../components/AlbumCollectionHeader';
import { Button } from '../components/Button';
import { CollectionHeader } from '../components/CollectionHeader';
import { CollectionPlayButtons } from '../components/CollectionPlayButtons';
import { CrossfadeLayers } from '../components/CrossfadeLayers';
import { IconButton } from '../components/IconButton';
import { NewPlaylistRow } from '../components/NewPlaylistRow';
import { PlaylistEditBar } from '../components/PlaylistEditBar';
import { ScreenTitleBar } from '../components/ScreenTitleBar';

const DETAIL_ARTWORK_SIZE = 120;

function newPlaylistSubtitle(canCreate: boolean, canImport: boolean): string {
  if (canCreate && canImport) return 'Start empty, or import a file from this phone';
  if (canImport) return 'Import a playlist file from this phone';
  return 'Start with an empty playlist';
}

type Translate = ReturnType<typeof useI18n>['t'];

interface PlaylistHeaderOptions {
  state: RemoteUiState;
  onAction: (action: RemoteAction) => void;
  t: Translate;
  playlistName: string;
  playlist: Playlist | null;
  canEditTracks: boolean;
  editMode: boolean;
  playlistArtwork: string | null | undefined;
  album: LibraryEntry | null;
  nested: boolean;
  ratedAlbums: boolean;
  nestedTitle: RemoteUiState['libraryNestedTitle'];
  canEditPlaylists: boolean;
  canImport: boolean;
  setEditing: (editing: boolean) => void;
  setOptionsPlaylist: (playlist: Playlist) => void;
  setNewSheetVisible: (visible: boolean) => void;
}

export function playlistHeaderItems(options: PlaylistHeaderOptions): LibraryItem[] {
  const { state, onAction, t, playlist, album, nested, ratedAlbums, nestedTitle, canEditPlaylists, canImport, setNewSheetVisible } = options;
  const shuffleActive = isShuffleMode(state.playbackMode);
  const nativeCollectionPlayback = state.supportedFeatures.includes('collection_playback');
  if (playlist) return playlistDetailHeader({ ...options, playlist }, shuffleActive, nativeCollectionPlayback);
  const items: LibraryItem[] = [];
  if (album) {
    items.push(
      nodeItem('title', <ScreenTitleBar onBack={() => onAction({ type: 'Back' })} />),
      nodeItem('album', (
        <AlbumCollectionHeader
          album={album}
          entries={state.libraryEntries}
          countLabel={state.libraryCountLabel}
          busy={state.collectionBusy}
          shuffleActive={shuffleActive}
          nativePlayback={nativeCollectionPlayback && state.connectionStatus === ConnectionStatus.Connected}
          onAction={onAction}
        />
      )),
    );
  } else if (nested) {
    items.push(
      nodeItem(
        'title',
        <ScreenTitleBar title={ratedAlbums ? t(TOP_RATED_ALBUMS_ROW.title) : nestedTitle === 'Tracks' ? t('Tracks') : nestedTitle ?? t('Playlists')} onBack={() => onAction({ type: 'Back' })} />,
      ),
    );
  } else {
    items.push(nodeItem('title', <ScreenTitleBar title={t('Playlists')} />));
    if (canEditPlaylists || canImport) {
      items.push(
        nodeItem(
          'new',
          <NewPlaylistRow
            subtitle={t(newPlaylistSubtitle(canEditPlaylists, canImport))}
            onPress={() => setNewSheetVisible(true)}
          />,
        ),
      );
    }
  }

  return items;
}

function playlistDetailHeader(
  options: PlaylistHeaderOptions & { playlist: Playlist }, shuffleActive: boolean, nativeCollectionPlayback: boolean,
): LibraryItem[] {
  const { state, onAction, t, playlist, canEditTracks, setEditing, setOptionsPlaylist, playlistName, playlistArtwork, editMode } = options;
  const playableIds = songIds(state.libraryEntries);
  // Native playback covers songs past the loaded page, but an empty playlist has nothing to start.
  const playButtons = playableIds.length || (nativeCollectionPlayback && state.playlistTrackCount > 0) ? (
    <CollectionPlayButtons
      busy={state.collectionBusy}
      onPlay={() => playCollection(onAction, playableIds, false, shuffleActive, nativeCollectionPlayback)}
      onShuffle={() => playCollection(onAction, playableIds, true, shuffleActive, nativeCollectionPlayback)}
    />
  ) : null;
  const browseActions = (
    <>
      {playButtons}
      {canEditTracks ? (
        <>
          {playableIds.length ? <Button label={t('Edit')} variant="raised" onPress={() => setEditing(true)} /> : null}
          <IconButton
            icon="moreVertical"
            label={t('Playlist options')}
            variant="raised"
            onPress={() => setOptionsPlaylist(playlist)}
          />
        </>
      ) : null}
    </>
  );
  return [
    nodeItem('title', <ScreenTitleBar backLabel={t('Playlists')} onBack={() => onAction({ type: 'Back' })} />),
    nodeItem(
      'header',
      <CollectionHeader
        eyebrow={playlist.writable ? t('Playlist') : t('Made by the player · read only')}
        title={playlistName}
        meta={t('{count} song', { count: state.playlistTrackCount })}
        artworkUri={playlistArtwork}
        artworkSize={DETAIL_ARTWORK_SIZE}
        placeholderIcon="playlist"
        actions={
          canEditTracks ? (
            <CrossfadeLayers
              showSecond={editMode}
              first={browseActions}
              second={<PlaylistEditBar onDone={() => setEditing(false)} />}
            />
          ) : (
            browseActions
          )
        }
      />,
    ),
  ];
}
