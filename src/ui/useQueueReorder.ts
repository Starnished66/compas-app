import { useEffect, useMemo, useRef, useState } from 'react';
import { RemoteAction, RemoteTrack } from '../data/types';
import { sameSong } from './trackKey';

export interface QueueMove {
  track: RemoteTrack;
  from: number;
  to: number;
}

export interface QueueReorder {
  queue: RemoteTrack[];
  moving: boolean;
  move(from: number, to: number): void;
}

interface PendingMove {
  track: RemoteTrack;
  from: number;
  current: number;
  target: number;
  step: -1 | 1;
  sentFor: RemoteTrack[];
}

const STEP_TIMEOUT_MS = 6000;

function withMoveApplied(queue: RemoteTrack[], from: number, to: number): RemoteTrack[] {
  if (from === to || !queue[from]) return queue;
  const reordered = [...queue];
  const [item] = reordered.splice(from, 1);
  reordered.splice(Math.min(to, reordered.length), 0, item);
  return reordered;
}

export function useQueueReorder(
  queue: RemoteTrack[],
  onAction: (action: RemoteAction) => void,
  onMoved?: (move: QueueMove) => void,
): QueueReorder {
  const [pending, setPending] = useState<PendingMove | null>(null);
  const pendingRef = useRef<PendingMove | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ queue, onAction, onMoved });
  latest.current = { queue, onAction, onMoved };

  const update = (next: PendingMove | null) => {
    pendingRef.current = next;
    setPending(next);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = next ? setTimeout(() => update(null), STEP_TIMEOUT_MS) : null;
  };

  const sendStep = (move: PendingMove, current: RemoteTrack[]) => {
    const row = current[move.current];
    if (!row) {
      update(null);
      return;
    }
    update({ ...move, sentFor: current });
    latest.current.onAction({ type: 'MoveQueueTrack', id: row.id, direction: move.step });
  };

  useEffect(() => {
    const move = pendingRef.current;
    if (!move || queue === move.sentFor) return;
    const expected = move.current + move.step;
    if (sameSong(queue[expected], move.track)) {
      const advanced = { ...move, current: expected };
      if (expected === move.target) {
        update(null);
        latest.current.onMoved?.({ track: move.track, from: move.from, to: move.target });
        return;
      }
      sendStep(advanced, queue);
      return;
    }
    if (sameSong(queue[move.current], move.track)) {
      update({ ...move, sentFor: queue });
      return;
    }
    update(null);
  }, [queue]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const displayed = useMemo(
    () => (pending ? withMoveApplied(queue, pending.current, pending.target) : queue),
    [pending, queue],
  );

  return {
    queue: displayed,
    moving: pending !== null,
    move: (from, to) => {
      const current = latest.current.queue;
      const track = current[from];
      if (pendingRef.current || !track || from === to || to < 0 || to >= current.length) return;
      sendStep({ track, from, current: from, target: to, step: to > from ? 1 : -1, sentFor: current }, current);
    },
  };
}
