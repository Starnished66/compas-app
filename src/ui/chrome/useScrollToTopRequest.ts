import { useContext, useEffect, useRef } from 'react';
import { ChromeContext, ScrollToTopTarget } from './chromeContext';

export function useScrollToTopRequest(target: ScrollToTopTarget, handler: () => void): void {
  const chrome = useContext(ChromeContext);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const subscribe = chrome?.subscribeScrollToTop;

  useEffect(() => {
    if (!subscribe) return;
    return subscribe(target, () => handlerRef.current());
  }, [subscribe, target]);
}
