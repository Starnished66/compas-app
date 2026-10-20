import { ConnectionTransport } from '../../data/types';
import { connectedPlayerSummary } from '../connectionSummary';

const targets = { wifiAddress: 'http://192.168.1.20:8899', bluetoothId: 'r1' };
const state = {
  connectionTransport: ConnectionTransport.Bluetooth,
  playerName: 'Compás Player',
  bluetoothPlayers: [{ id: 'r1', name: 'R1', paired: true, bonding: false }],
  wifiPlayers: [{ id: 'simulator', name: 'Compas Remote Control', address: targets.wifiAddress }],
};

describe('connection prompt player summary', () => {
  it('names the attempted Wi-Fi player while the previous session transport is Bluetooth', () => {
    expect(connectedPlayerSummary({ ...state, connectionAttemptTransport: ConnectionTransport.Wifi }, targets))
      .toEqual({ name: 'Compas Remote Control', detail: targets.wifiAddress });
    expect(state.connectionTransport).toBe(ConnectionTransport.Bluetooth);
  });

  it('uses the actual session transport when no connection attempt is active', () => {
    expect(connectedPlayerSummary({ ...state, connectionAttemptTransport: null }, targets))
      .toEqual({ name: 'R1', detail: 'Bluetooth' });
    expect(connectedPlayerSummary({ ...state, connectionTransport: ConnectionTransport.Wifi, connectionAttemptTransport: null }, targets))
      .toEqual({ name: 'Compas Remote Control', detail: targets.wifiAddress });
  });
});
