import React from 'react';
import { useChromeState } from '../chrome/useChromeState';
import { SnackbarProvider } from '../snackbar/SnackbarProvider';
import { TabKey } from './TabBar';
import { useScreenInsets } from '../useScreenInsets';
import { insetBeyond } from '../insetBeyond';
import { ChromeInset } from './bottomChromeLayout';

const offsetAboveTabBar = 80;
const offsetAboveMiniPlayer = 148;
const offsetWithoutChrome = 16;

export interface AppSnackbarProviderProps {
  activeTab: TabKey;
  showMiniPlayer: boolean;
  chromeHidden: boolean;
  children: React.ReactNode;
}

export function AppSnackbarProvider({ activeTab, showMiniPlayer, chromeHidden, children }: AppSnackbarProviderProps) {
  const { minimized } = useChromeState();
  const insets = useScreenInsets();
  const tabBarMinimized = minimized && (activeTab === 'library' || activeTab === 'playlists');
  const bottomOffset = chromeHidden
    ? offsetWithoutChrome
    : showMiniPlayer && !tabBarMinimized
      ? offsetAboveMiniPlayer
      : offsetAboveTabBar;
  return <SnackbarProvider bottomOffset={bottomOffset + insetBeyond(insets.bottom, chromeHidden ? offsetWithoutChrome : ChromeInset)}>{children}</SnackbarProvider>;
}
