import { createContext } from 'react';

export interface SnackbarMessage {
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}

export interface SnackbarEntry extends SnackbarMessage {
  id: number;
}

export interface SnackbarControls {
  show(message: SnackbarMessage): void;
  hide(): void;
}

export interface SnackbarHostState {
  message: SnackbarEntry | null;
  topHostId: number | null;
  registerHost(id: number, priority: number): void;
  unregisterHost(id: number): void;
  runAction(): void;
}

export const SnackbarControlsContext = createContext<SnackbarControls | null>(null);
export const SnackbarHostContext = createContext<SnackbarHostState | null>(null);
