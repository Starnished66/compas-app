import { useCallback, useEffect, useRef, useState } from 'react';
import type { RemoteAction } from '../../data/types';

export function useBulkSelection(selected: ReadonlySet<string>, onAction: (action: RemoteAction) => void) {
  const [ids, setIds] = useState<string[] | null>(null);
  const opened = useRef<string[] | null>(null);
  const release = useCallback(() => {
    if (opened.current) onAction({ type: 'ReleaseBulkSelection', ids: opened.current });
    opened.current = null;
  }, [onAction]);

  useEffect(() => release, [release]);

  const open = useCallback(() => {
    if (!selected.size || opened.current) return;
    const snapshot = [...selected];
    opened.current = snapshot;
    onAction({ type: 'CaptureBulkSelection', ids: snapshot });
    setIds(snapshot);
  }, [onAction, selected]);
  const close = () => {
    release();
    setIds(null);
  };
  return { ids, open, close };
}
