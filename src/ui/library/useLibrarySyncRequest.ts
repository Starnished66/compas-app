import { useCallback, useEffect, useRef, useState } from 'react';

export type LibrarySyncPhase = 'idle' | 'syncing' | 'done';

const NO_RESPONSE_MS = 2000;
const DONE_VISIBLE_MS = 4000;

export function useLibrarySyncRequest(syncMessage: string | null | undefined, onSync: () => void) {
  const [phase, setPhase] = useState<LibrarySyncPhase>('idle');
  const sawMessage = useRef(false);

  useEffect(() => {
    if (phase !== 'syncing') return;
    if (syncMessage) {
      sawMessage.current = true;
      return;
    }
    if (sawMessage.current) {
      setPhase('done');
      return;
    }
    const timer = setTimeout(() => setPhase('done'), NO_RESPONSE_MS);
    return () => clearTimeout(timer);
  }, [phase, syncMessage]);

  useEffect(() => {
    if (phase !== 'done') return;
    const timer = setTimeout(() => setPhase('idle'), DONE_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  const sync = useCallback(() => {
    sawMessage.current = false;
    setPhase('syncing');
    onSync();
  }, [onSync]);

  return { phase: syncMessage ? 'syncing' : phase, sync };
}
