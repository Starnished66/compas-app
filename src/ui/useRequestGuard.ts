import { useEffect, useMemo, useRef } from 'react';

export interface RequestGuard {
  /** Starts a new request generation and returns an ownership predicate for it. */
  next: () => () => boolean;
  /** Invalidates any in-flight request so its response cannot commit state. */
  invalidate: () => void;
}

/** Tracks request ownership across async operations and invalidates on unmount. */
export function useRequestGuard(): RequestGuard {
  const generationRef = useRef(0);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      generationRef.current += 1;
    };
  }, []);

  return useMemo<RequestGuard>(
    () => ({
      next: () => {
        const generation = ++generationRef.current;
        return () => aliveRef.current && generationRef.current === generation;
      },
      invalidate: () => {
        generationRef.current += 1;
      },
    }),
    [],
  );
}
