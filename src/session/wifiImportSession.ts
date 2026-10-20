export interface WifiImportSessionIdentity<Api extends object> {
  api: Api;
  attempt: number;
  playerKey: string;
  endpoint: string;
}

export interface CurrentWifiImportSession<Api extends object> {
  api: Api | null;
  attempt: number;
  playerKey: string | null;
  endpoint: string | null;
  connected: boolean;
  transport: 'wifi' | 'bluetooth';
}

export function isCurrentWifiImportSession<Api extends object>(
  expected: WifiImportSessionIdentity<Api>,
  current: CurrentWifiImportSession<Api>,
): boolean {
  return current.connected && current.transport === 'wifi' && current.api === expected.api &&
    current.attempt === expected.attempt && current.playerKey === expected.playerKey &&
    current.endpoint === expected.endpoint;
}
