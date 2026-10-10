import { useCallback, useEffect, useRef, useState } from 'react';
import { ConnectionStatus, RemoteAction, RemoteUiState } from '../../data/types';

export type PendingSongAction =
  | { kind: 'queue'; title: string }
  | { kind: 'playlist'; title: string; key: string; playlistName: string }
  | { kind: 'create'; title: string; playlistName: string }
  | { kind: 'favorite'; title: string; favorite: boolean; entryId: string | null }
  | { kind: 'remove'; title: string; playlistName: string }
  | { kind: 'move'; title: string; direction: -1 | 1 };

interface PendingRecord {
  action: PendingSongAction;
  messageAtStart: string | null;
  target: string;
}

const REVEAL_DELAY_MS = 5000;
const GIVE_UP_DELAY_MS = 12000;

export function useSongActionPending(
  state: RemoteUiState,
  onAction: (action: RemoteAction) => void,
  onConfirmed: (action: PendingSongAction) => void,
) {
  const [pending, setPending] = useState<PendingRecord | null>(null);
  const [revealed, setRevealed] = useState(false);
  const onConfirmedRef = useRef(onConfirmed);
  onConfirmedRef.current = onConfirmed;
  const connectionMessage = state.connectionMessage ?? null;
  const connected = state.connectionStatus === ConnectionStatus.Connected;
  const target = `${state.songActionTitle}\u0000${state.songActionPosition ?? ''}`;

  const start = useCallback(
    (action: PendingSongAction, request: RemoteAction) => {
      setPending({ action, messageAtStart: connectionMessage, target });
      setRevealed(connectionMessage != null);
      onAction(request);
    },
    [connectionMessage, onAction, target],
  );

  const clear = useCallback(() => {
    setPending(null);
    setRevealed(false);
  }, []);

  useEffect(() => {
    if (!pending) return;
    const failed = connectionMessage != null && connectionMessage !== pending.messageAtStart;
    if (failed || target !== pending.target) clear();
  }, [clear, connectionMessage, pending, target]);

  useEffect(() => {
    if (!pending || state.songActionsVisible) return;
    if (pending.action.kind !== 'favorite' && connected) onConfirmedRef.current(pending.action);
    clear();
  }, [clear, connected, pending, state.songActionsVisible]);

  useEffect(() => {
    if (pending?.action.kind !== 'favorite' || state.songActionFavorite !== pending.action.favorite) return;
    onConfirmedRef.current(pending.action);
    clear();
    onAction({ type: 'CloseSongActions' });
  }, [clear, onAction, pending, state.songActionFavorite]);

  useEffect(() => {
    if (!pending) return;
    const reveal = setTimeout(() => setRevealed(true), REVEAL_DELAY_MS);
    const giveUp = setTimeout(clear, GIVE_UP_DELAY_MS);
    return () => {
      clearTimeout(reveal);
      clearTimeout(giveUp);
    };
  }, [clear, pending]);

  return { pending: pending?.action ?? null, revealed, start, clear };
}
