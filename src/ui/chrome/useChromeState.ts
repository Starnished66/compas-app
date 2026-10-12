import { useContext } from 'react';
import { ChromeActionsContext, ChromeMinimizedContext, ScrollToTopTarget } from './chromeContext';

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
  const actions = useContext(ChromeActionsContext);
  const minimized = useContext(ChromeMinimizedContext);
  return actions
    ? { minimized, expand: actions.expand, requestScrollToTop: actions.requestScrollToTop }
    : detachedChrome;
}
