import { useEffect, useRef } from 'react';
import { useTabActive } from './tabActivity';

type Interceptor = { current: () => void };

// Ordered stack instead of separate BackHandler listeners: RN calls the most recently added listener
// first, so any re-registration elsewhere would silently jump ahead of the screen interceptors.
const interceptors: Interceptor[] = [];

/** Runs the most recently activated interceptor; useHardwareBack calls this before navigating. */
export function dispatchBackInterceptor(): boolean {
  const top = interceptors[interceptors.length - 1];
  if (!top) return false;
  top.current();
  return true;
}

export function useBackInterceptor(enabled: boolean, onBack: () => void): void {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  const tabActive = useTabActive();
  const active = enabled && tabActive;

  useEffect(() => {
    if (!active) return;
    const entry: Interceptor = { current: () => onBackRef.current() };
    interceptors.push(entry);
    return () => {
      const index = interceptors.indexOf(entry);
      if (index >= 0) interceptors.splice(index, 1);
    };
  }, [active]);
}
