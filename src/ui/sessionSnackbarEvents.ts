import { ConnectionStatus, ConnectionTransport, RemoteUiState } from '../data/types';
import { connectedPlayerSummary } from './connectionSummary';

export type SessionSnapshot = Pick<
  RemoteUiState,
  | 'screen'
  | 'connectionStatus'
  | 'connectionTransport'
  | 'connectionMessage'
  | 'wifiAddress'
  | 'wifiPlayers'
  | 'bluetoothPlayers'
  | 'selectedBluetoothPlayerId'
  | 'playerName'
  | 'pinDialogVisible'
  | 'currentTrack'
  | 'catalogSyncMessage'
  | 'songActionsVisible'
>;

export interface SessionMemory {
  status: ConnectionStatus;
  playerKey: string | null;
  droppedWithTrack: boolean;
  pinDialogVisible: boolean;
  updatingPin: boolean;
  syncMessage: string | null;
  syncTransferred: boolean;
  syncSongTotal: number | null;
  connectionMessage: string | null;
}

export interface SessionStep {
  memory: SessionMemory;
  message: string | null;
}

const SYNC_TRANSFER = /^(Syncing|Downloading)\b/;
const SONG_SYNC_PROGRESS = /^Syncing songs \d+\/(\d+)/;

export function connectionMessageShownInline(state: SessionSnapshot): boolean {
  return (
    state.connectionStatus !== ConnectionStatus.Connected ||
    state.screen.type !== 'Home' ||
    state.songActionsVisible ||
    state.pinDialogVisible
  );
}

function currentPlayerKey(state: SessionSnapshot): string {
  return state.connectionTransport === ConnectionTransport.Bluetooth
    ? `bt:${(state.selectedBluetoothPlayerId ?? '').toLowerCase()}`
    : `wifi:${state.wifiAddress.trim()}`;
}

function currentPlayerName(state: SessionSnapshot): string {
  return connectedPlayerSummary(state, {
    wifiAddress: state.wifiAddress.trim(),
    bluetoothId: state.selectedBluetoothPlayerId,
  }).name;
}

export function initialSessionMemory(state: SessionSnapshot): SessionMemory {
  const connected = state.connectionStatus === ConnectionStatus.Connected;
  return {
    status: state.connectionStatus,
    playerKey: connected ? currentPlayerKey(state) : null,
    droppedWithTrack: false,
    pinDialogVisible: state.pinDialogVisible,
    updatingPin: false,
    syncMessage: state.catalogSyncMessage ?? null,
    syncTransferred: false,
    syncSongTotal: null,
    connectionMessage: state.connectionMessage ?? null,
  };
}

type Translate = (source: string, variables?: Record<string, string | number>) => string;

function connectionEvent(memory: SessionMemory, state: SessionSnapshot, next: SessionMemory, t?: Translate): string | null {
  const connected = state.connectionStatus === ConnectionStatus.Connected;
  const wasConnected = memory.status === ConnectionStatus.Connected;

  if (state.pinDialogVisible && !memory.pinDialogVisible && wasConnected) next.updatingPin = true;

  if (connected && !wasConnected) {
    const key = currentPlayerKey(state);
    const updatedPin = memory.updatingPin;
    const recovered = memory.droppedWithTrack && key === memory.playerKey;
    next.playerKey = key;
    next.droppedWithTrack = false;
    next.updatingPin = false;
    if (updatedPin) return t ? t('Saved PIN updated') : 'Saved PIN updated';
    const name = currentPlayerName(state);
    return t
      ? t(recovered ? 'Reconnected to {name}' : 'Connected to {name}', { name })
      : `${recovered ? 'Reconnected to' : 'Connected to'} ${name}`;
  }

  if (!state.pinDialogVisible && memory.pinDialogVisible) next.updatingPin = false;
  if (!connected) {
    next.droppedWithTrack = wasConnected ? !!state.currentTrack : memory.droppedWithTrack && !!state.currentTrack;
  }
  return null;
}

function syncEvent(memory: SessionMemory, state: SessionSnapshot, next: SessionMemory, t?: Translate): string | null {
  const message = state.catalogSyncMessage ?? null;
  next.syncMessage = message;
  if (message) {
    if (SYNC_TRANSFER.test(message)) next.syncTransferred = true;
    const total = SONG_SYNC_PROGRESS.exec(message)?.[1];
    if (total) next.syncSongTotal = Number(total);
    return null;
  }
  if (!memory.syncMessage) return null;
  const finished = memory.syncTransferred && state.connectionStatus === ConnectionStatus.Connected;
  const total = memory.syncSongTotal;
  next.syncTransferred = false;
  next.syncSongTotal = null;
  if (!finished) return null;
  if (total === null) return t ? t('Library synced') : 'Library synced';
  return t ? t('Library synced · {count} song', { count: total }) : `Library synced · ${total} ${total === 1 ? 'song' : 'songs'}`;
}

function errorEvent(memory: SessionMemory, state: SessionSnapshot, next: SessionMemory): string | null {
  const message = state.connectionMessage ?? null;
  next.connectionMessage = message;
  if (!message || message === memory.connectionMessage) return null;
  return connectionMessageShownInline(state) ? null : message;
}

export function stepSession(memory: SessionMemory, state: SessionSnapshot, t?: Translate): SessionStep {
  const next: SessionMemory = {
    ...memory,
    status: state.connectionStatus,
    pinDialogVisible: state.pinDialogVisible,
  };
  const connection = connectionEvent(memory, state, next, t);
  const error = errorEvent(memory, state, next);
  const sync = syncEvent(memory, state, next, t);
  return { memory: next, message: connection ?? error ?? sync };
}
