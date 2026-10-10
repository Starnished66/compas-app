import { useCallback, useEffect, useRef, useState } from 'react';
import { ContentStatus, LibraryEntry, RemoteAction, RemoteUiState } from '../../data/types';
import { movePlaylistEntry, removePlaylistEntry } from './playlistTrackEdits';

type Dispatch = (action: RemoteAction) => void;

interface PendingMove {
  index: number;
  remaining: number;
  direction: -1 | 1;
  title: string;
}

interface PendingEdit {
  playlistKey: string;
  baseRevision: string | null;
  move: PendingMove | null;
  startedAt: number;
}

export interface PlaylistEditOutcome {
  kind: 'removed' | 'moved';
  title: string;
}

export interface PlaylistTrackEdits {
  entries: LibraryEntry[];
  busy: boolean;
  remove: (entry: LibraryEntry) => void;
  move: (from: number, to: number) => void;
}

const EDIT_TIMEOUT_MS = 15000;

function reorder<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function usePlaylistTrackEdits(
  state: RemoteUiState,
  onAction: Dispatch,
  onSettled: (outcome: PlaylistEditOutcome) => void,
): PlaylistTrackEdits {
  const [override, setOverride] = useState<LibraryEntry[] | null>(null);
  const pending = useRef<PendingEdit | null>(null);
  const outcome = useRef<PlaylistEditOutcome | null>(null);
  const latest = useRef({ state, onAction, onSettled });
  latest.current = { state, onAction, onSettled };
  const playlistKey = state.activePlaylist?.key ?? null;
  const entries = override ?? state.libraryEntries;

  const settle = useCallback((succeeded: boolean) => {
    pending.current = null;
    setOverride(null);
    const result = outcome.current;
    outcome.current = null;
    if (succeeded && result) latest.current.onSettled(result);
  }, []);

  useEffect(() => {
    const edit = pending.current;
    if (!edit) return;
    const { libraryEntries, libraryStatus, playlistRevision, connectionMessage } = state;
    if (playlistKey !== edit.playlistKey || Date.now() - edit.startedAt > EDIT_TIMEOUT_MS) {
      settle(false);
      return;
    }
    if (libraryStatus === ContentStatus.Loading) return;
    if (connectionMessage) {
      settle(false);
      return;
    }
    if ((playlistRevision ?? null) === edit.baseRevision) return;
    const move = edit.move;
    if (!move || move.remaining <= 1) {
      settle(true);
      return;
    }
    const index = move.index + move.direction;
    const next = libraryEntries[index];
    const target = libraryEntries[index + move.direction];
    if (!next || !target || next.title !== move.title) {
      settle(false);
      return;
    }
    pending.current = {
      ...edit,
      baseRevision: playlistRevision ?? null,
      move: { ...move, index, remaining: move.remaining - 1 },
    };
    movePlaylistEntry(onAction, next.id, move.direction);
  }, [
    onAction,
    playlistKey,
    settle,
    state,
  ]);

  const begin = (nextEntries: LibraryEntry[], move: PendingMove | null, result: PlaylistEditOutcome) => {
    const current = latest.current.state;
    if (!current.activePlaylist) return false;
    pending.current = {
      playlistKey: current.activePlaylist.key,
      baseRevision: current.playlistRevision ?? null,
      move,
      startedAt: Date.now(),
    };
    outcome.current = result;
    setOverride(nextEntries);
    return true;
  };

  const remove = useCallback((entry: LibraryEntry) => {
    if (pending.current) return;
    const source = latest.current.state.libraryEntries;
    if (!source.includes(entry)) return;
    if (!begin(source.filter((item) => item !== entry), null, { kind: 'removed', title: entry.title })) return;
    removePlaylistEntry(latest.current.onAction, entry.id);
  }, []);

  const move = useCallback((from: number, to: number) => {
    if (pending.current || from === to) return;
    const source = latest.current.state.libraryEntries;
    const entry = source[from];
    if (!entry || to < 0 || to >= source.length) return;
    const direction = to > from ? 1 : -1;
    const pendingMove = { index: from, remaining: Math.abs(to - from), direction, title: entry.title } as const;
    if (!begin(reorder(source, from, to), pendingMove, { kind: 'moved', title: entry.title })) return;
    movePlaylistEntry(latest.current.onAction, entry.id, direction);
  }, []);

  return { entries, busy: override != null, remove, move };
}
