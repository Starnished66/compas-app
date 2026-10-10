import React, { ReactNode, useCallback, useMemo, useRef, useState } from 'react';
import { ChromeContext, ChromeContextValue, ScrollToTopTarget } from './chromeContext';

export function ChromeProvider({ children }: { children: ReactNode }) {
  const [minimized, setMinimized] = useState(false);
  const minimizedRef = useRef(false);
  const expandedAt = useRef(0);
  const scrollToTopHandlers = useRef(new Map<ScrollToTopTarget, Set<() => void>>()).current;

  const expand = useCallback(() => {
    if (!minimizedRef.current) return;
    minimizedRef.current = false;
    expandedAt.current = Date.now();
    setMinimized(false);
  }, []);

  const minimize = useCallback(() => {
    if (minimizedRef.current) return;
    minimizedRef.current = true;
    setMinimized(true);
  }, []);

  const lastExpandedAt = useCallback(() => expandedAt.current, []);

  const requestScrollToTop = useCallback(
    (target: ScrollToTopTarget) => scrollToTopHandlers.get(target)?.forEach((handler) => handler()),
    [scrollToTopHandlers],
  );

  const subscribeScrollToTop = useCallback(
    (target: ScrollToTopTarget, handler: () => void) => {
      const handlers = scrollToTopHandlers.get(target) ?? new Set<() => void>();
      handlers.add(handler);
      scrollToTopHandlers.set(target, handlers);
      return () => {
        handlers.delete(handler);
      };
    },
    [scrollToTopHandlers],
  );

  const value = useMemo<ChromeContextValue>(
    () => ({ minimized, expand, minimize, lastExpandedAt, requestScrollToTop, subscribeScrollToTop }),
    [expand, lastExpandedAt, minimize, minimized, requestScrollToTop, subscribeScrollToTop],
  );

  return <ChromeContext.Provider value={value}>{children}</ChromeContext.Provider>;
}
