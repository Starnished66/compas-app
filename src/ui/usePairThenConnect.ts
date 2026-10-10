import { useCallback, useEffect, useRef, useState } from 'react';
import { BluetoothPlayer, RemoteAction } from '../data/types';

export function usePairThenConnect(
  players: BluetoothPlayer[],
  onAction: (action: RemoteAction) => void,
): (id: string) => void {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const sawBondingRef = useRef(false);

  useEffect(() => {
    if (!pendingId) return;
    const player = players.find((candidate) => candidate.id === pendingId);
    if (!player) return;
    if (player.paired) {
      setPendingId(null);
      onAction({ type: 'Connect' });
      return;
    }
    if (player.bonding) {
      sawBondingRef.current = true;
    } else if (sawBondingRef.current) {
      setPendingId(null);
    }
  }, [onAction, pendingId, players]);

  return useCallback(
    (id: string) => {
      sawBondingRef.current = false;
      setPendingId(id);
      onAction({ type: 'SelectBluetoothPlayer', id });
      onAction({ type: 'PairBluetoothPlayer', id });
    },
    [onAction],
  );
}
