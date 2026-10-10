import { useCallback, useEffect, useRef } from 'react';
import { ContentStatus, LibraryCategory, LibraryEntry, RemoteAction, RemoteUiState } from '../../data/types';
import { playlistDisplayName } from '../playlistName';

export interface PlaylistMatch {
  key?: string;
  name?: string;
}

interface ViewRequest {
  match: PlaylistMatch;
  startedAt: number;
  sawLoading: boolean;
}

const VIEW_TIMEOUT_MS = 10000;

function matchesPlaylist(entry: LibraryEntry, match: PlaylistMatch): boolean {
  if (!entry.playlistKey) return false;
  if (match.key) return entry.playlistKey === match.key;
  return match.name != null && playlistDisplayName(entry.title).trim().toLowerCase() === match.name.trim().toLowerCase();
}

export function isViewingPlaylist(state: RemoteUiState, key: string): boolean {
  return (
    state.screen.type === 'Library' &&
    state.screen.category === LibraryCategory.Playlists &&
    state.libraryIsNested &&
    state.activePlaylist?.key === key
  );
}

export function usePlaylistViewer(state: RemoteUiState, onAction: (action: RemoteAction) => void) {
  const requestRef = useRef<ViewRequest | null>(null);

  const viewPlaylist = useCallback(
    (match: PlaylistMatch) => {
      requestRef.current = { match, startedAt: Date.now(), sawLoading: false };
      onAction({ type: 'OpenLibrary', category: LibraryCategory.Playlists });
    },
    [onAction],
  );

  const { screen, libraryEntries, libraryIsNested, libraryStatus } = state;

  useEffect(() => {
    const request = requestRef.current;
    if (!request) return;
    const onPlaylistsRoot =
      screen.type === 'Library' && screen.category === LibraryCategory.Playlists && !libraryIsNested;
    if (!onPlaylistsRoot || Date.now() - request.startedAt > VIEW_TIMEOUT_MS) {
      requestRef.current = null;
      return;
    }
    if (libraryStatus === ContentStatus.Loading) {
      request.sawLoading = true;
      return;
    }
    if (!request.sawLoading) return;
    requestRef.current = null;
    const entry = libraryEntries.find((candidate) => matchesPlaylist(candidate, request.match));
    if (entry) onAction({ type: 'SelectLibraryEntry', id: entry.id });
  }, [libraryEntries, libraryIsNested, libraryStatus, onAction, screen]);

  return viewPlaylist;
}
