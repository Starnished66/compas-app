import React from 'react';
import { SnackbarProvider } from '../snackbar/SnackbarProvider';
import { useScreenInsets } from '../useScreenInsets';
import { insetBeyond } from '../insetBeyond';
import { ChromeInset } from './bottomChromeLayout';

const offsetAboveTabBar = 80;
const offsetAboveMiniPlayer = 148;
const offsetWithoutChrome = 16;

export interface AppSnackbarProviderProps {
  showMiniPlayer: boolean;
  chromeHidden: boolean;
  children: React.ReactNode;
}

export function AppSnackbarProvider({ showMiniPlayer, chromeHidden, children }: AppSnackbarProviderProps) {
  const insets = useScreenInsets();
  const bottomOffset = chromeHidden
    ? offsetWithoutChrome
    : showMiniPlayer
      ? offsetAboveMiniPlayer
      : offsetAboveTabBar;
  return <SnackbarProvider bottomOffset={bottomOffset + insetBeyond(insets.bottom, chromeHidden ? offsetWithoutChrome : ChromeInset)}>{children}</SnackbarProvider>;
}
