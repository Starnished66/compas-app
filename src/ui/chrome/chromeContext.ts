import { createContext } from 'react';

export type ScrollToTopTarget = 'home' | 'library' | 'playlists' | 'transfer';

export interface ChromeActions {
  expand(): void;
  minimize(): void;
  lastExpandedAt(): number;
  requestScrollToTop(target: ScrollToTopTarget): void;
  subscribeScrollToTop(target: ScrollToTopTarget, handler: () => void): () => void;
}

export const ChromeActionsContext = createContext<ChromeActions | null>(null);

export const ChromeMinimizedContext = createContext(false);
