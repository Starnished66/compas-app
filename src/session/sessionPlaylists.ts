import type { createLibraryLists } from './libraryLists';
import type { SessionState } from './useSessionRefs';
import { Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { LibraryCategory, Playlist } from '../data/types';

interface SessionPlaylistsDependencies extends Pick<ReturnType<typeof createLibraryLists>, 'loadLibraryCategory'> {
  shared: Pick<SessionState,
    'activePlaylistRef' | 'apiRef' | 'featureSetRef' | 'setState' | 'songActionTargetRef' | 'stateRef'
  >;
  browsePlaylist: (playlist: Playlist) => Promise<void>;
  closeSongActions: () => void;
}

const createEmptyPlaylist = async (deps: SessionPlaylistsDependencies, name: string) => {
  const { shared: { apiRef, featureSetRef, setState }, loadLibraryCategory } = deps;
  const api = apiRef.current;
  if (!api || !featureSetRef.current.has('playlist_edit')) return;
  try {
    await api.createEmptyPlaylist(name.trim());
    if (api === apiRef.current) await loadLibraryCategory(LibraryCategory.Playlists, api);
  } catch (err: any) {
    setState((prev) => ({ ...prev, connectionMessage: err?.message || 'Could not create playlist' }));
  }
};

const editPlaylist = async (deps: SessionPlaylistsDependencies, key: string, name?: string) => {
  const { shared: { apiRef, featureSetRef, setState }, loadLibraryCategory } = deps;
  const api = apiRef.current;
  if (!api || !featureSetRef.current.has('playlist_edit')) return;
  try {
    if (name != null) await api.renamePlaylist(key, name.trim());
    else await api.deletePlaylist(key);
    if (api === apiRef.current) await loadLibraryCategory(LibraryCategory.Playlists, api);
  } catch (err: any) {
    setState((prev) => ({ ...prev, connectionMessage: err?.message || 'Could not edit playlist' }));
  }
};

const editPlaylistTrack = async (deps: SessionPlaylistsDependencies, direction?: -1 | 1) => {
  const { browsePlaylist, closeSongActions } = deps;
  const { activePlaylistRef, apiRef, featureSetRef, setState, songActionTargetRef, stateRef } = deps.shared;
  const api = apiRef.current;
  const playlist = activePlaylistRef.current;
  const song = songActionTargetRef.current?.song;
  const revision = stateRef.current.playlistRevision;
  if (!api || !playlist?.writable || !revision || song?.position == null ||
      !featureSetRef.current.has('playlist_edit')) return;
  try {
    if (direction) {
      const positions = stateRef.current.libraryEntries
        .map((entry) => entry.playlistPosition)
        .filter((position): position is number => position != null);
      const to = direction < 0
        ? positions.filter((position) => position < song.position!).at(-1)
        : positions.find((position) => position > song.position!);
      if (to == null) return;
      await api.movePlaylistTrack(playlist.key, song.position, to, revision);
    } else {
      await api.removePlaylistTrack(playlist.key, song.position, revision);
    }
    if (api === apiRef.current) {
      closeSongActions();
      await browsePlaylist(playlist);
    }
  } catch (err: any) {
    if (api !== apiRef.current) return;
    setState((prev) => ({ ...prev, connectionMessage: err?.statusCode === 409
      ? 'The playlist changed. Reload it and try again.' : err?.message || 'Could not edit playlist' }));
    if (err?.statusCode === 409) await browsePlaylist(playlist);
  }
};

const importPlaylist = async (deps: SessionPlaylistsDependencies, name: string) => {
  const { shared: { apiRef, featureSetRef, setState }, loadLibraryCategory } = deps;
  const api = apiRef.current;
  if (!api || !featureSetRef.current.has('playlist_import')) return;
  try {
    const selection = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (selection.canceled || api !== apiRef.current) return;
    const asset = selection.assets[0];
    if (!asset || !/\.m3u8?$/i.test(asset.name)) throw new Error('Choose an M3U or M3U8 playlist file');
    if (asset.size != null && asset.size > 256 * 1024) throw new Error('Playlist file must be 256 KiB or smaller');
    const body = await new File(asset.uri).bytes();
    if (api !== apiRef.current) return;
    const result = await api.importPlaylist(name.trim(), body);
    if (api !== apiRef.current) return;
    await loadLibraryCategory(LibraryCategory.Playlists, api);
    Alert.alert('Playlist imported', `${result.matched} of ${result.entries} entries matched songs on this player.`);
  } catch (err: any) {
    if (api !== apiRef.current) return;
    setState((prev) => ({ ...prev, connectionMessage: err?.message || 'Could not import playlist' }));
  }
};

export function createSessionPlaylists(deps: SessionPlaylistsDependencies) {
  return {
    createEmptyPlaylist: createEmptyPlaylist.bind(undefined, deps),
    editPlaylist: editPlaylist.bind(undefined, deps),
    editPlaylistTrack: editPlaylistTrack.bind(undefined, deps),
    importPlaylist: importPlaylist.bind(undefined, deps),
  };
}
