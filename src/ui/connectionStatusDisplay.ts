import { ConnectionStatus, ConnectionTransport } from '../data/types';
import { ConnectionStatus as StatusKind } from './components/StatusIndicator';
import { translate as translateEnglish } from '../i18n/translate';

type Translate = (source: string, variables?: Record<string, string | number>) => string;
const english: Translate = (source, variables) => translateEnglish(source, 'en', variables);

export function connectionStatusKind(status: ConnectionStatus): StatusKind {
  switch (status) {
    case ConnectionStatus.Connected:
      return 'ok';
    case ConnectionStatus.Connecting:
      return 'busy';
    case ConnectionStatus.Error:
      return 'error';
    default:
      return 'idle';
  }
}

export function transportLabel(transport: ConnectionTransport): string {
  return transport === ConnectionTransport.Bluetooth ? 'Bluetooth' : 'Wi-Fi';
}

export function connectionStatusLabel(status: ConnectionStatus): string {
  switch (status) {
    case ConnectionStatus.Connected:
      return 'Connected';
    case ConnectionStatus.Connecting:
      return 'Connecting…';
    case ConnectionStatus.Error:
      return 'Connection failed';
    default:
      return 'Not connected';
  }
}

export function connectionStatusDescription(
  status: ConnectionStatus,
  transport: ConnectionTransport,
  playerName: string,
  t: Translate = english,
): string {
  if (status !== ConnectionStatus.Connected) return t(connectionStatusLabel(status));
  const name = playerName.trim();
  return name
    ? t('Connected to {name} · {transport}', { name, transport: transportLabel(transport) })
    : t('Connected · {transport}', { transport: transportLabel(transport) });
}
