import { RemoteAction } from '../../data/types';

type Dispatch = (action: RemoteAction) => void;

export function removePlaylistEntry(onAction: Dispatch, entryId: string) {
  onAction({ type: 'OpenSongActions', id: entryId });
  onAction({ type: 'RemovePlaylistTrack' });
  onAction({ type: 'CloseSongActions' });
}

export function movePlaylistEntry(onAction: Dispatch, entryId: string, direction: -1 | 1) {
  onAction({ type: 'OpenSongActions', id: entryId });
  onAction({ type: 'MovePlaylistTrack', direction });
  onAction({ type: 'CloseSongActions' });
}
