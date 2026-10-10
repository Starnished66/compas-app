import { createContext } from 'react';

export type ScrollToTopTarget = 'home' | 'library' | 'playlists';

export interface ChromeContextValue {
  minimized: boolean;
  expand(): void;
  minimize(): void;
  lastExpandedAt(): number;
  requestScrollToTop(target: ScrollToTopTarget): void;
  subscribeScrollToTop(target: ScrollToTopTarget, handler: () => void): () => void;
}

export const ChromeContext = createContext<ChromeContextValue | null>(null);
