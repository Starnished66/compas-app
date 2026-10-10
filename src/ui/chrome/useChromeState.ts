import { useContext } from 'react';
import { ChromeContext, ScrollToTopTarget } from './chromeContext';

export interface ChromeState {
  minimized: boolean;
  expand(): void;
  requestScrollToTop(target: ScrollToTopTarget): void;
}

const detachedChrome: ChromeState = {
  minimized: false,
  expand: () => undefined,
  requestScrollToTop: () => undefined,
};

export function useChromeState(): ChromeState {
  const context = useContext(ChromeContext);
  return context
    ? { minimized: context.minimized, expand: context.expand, requestScrollToTop: context.requestScrollToTop }
    : detachedChrome;
}
