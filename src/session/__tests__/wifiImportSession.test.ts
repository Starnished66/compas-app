import { isCurrentWifiImportSession } from '../wifiImportSession';

describe('isCurrentWifiImportSession', () => {
  const api = {};
  const expected = { api, attempt: 4, playerKey: 'http://192.168.1.5:8899', endpoint: 'http://192.168.1.5:8899' };
  const current = { ...expected, connected: true, transport: 'wifi' as const };

  it('accepts the active Wi-Fi session', () => {
    expect(isCurrentWifiImportSession(expected, current)).toBe(true);
  });

  it('rejects stale, disconnected, or Bluetooth sessions', () => {
    expect(isCurrentWifiImportSession(expected, { ...current, attempt: 5 })).toBe(false);
    expect(isCurrentWifiImportSession(expected, { ...current, connected: false })).toBe(false);
    expect(isCurrentWifiImportSession(expected, { ...current, transport: 'bluetooth' })).toBe(false);
  });
});
