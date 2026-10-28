import { ConnectionStatus, ConnectionTransport, LibraryCategory } from '../../data/types';
import { initialSessionMemory, SessionMemory, SessionSnapshot, stepSession } from '../sessionSnackbarEvents';

const track = { id: 'now_playing', title: 'Song', artist: 'Artist', album: 'Album', duration: '3:00' };

const base: SessionSnapshot = {
  screen: { type: 'Home' },
  connectionStatus: ConnectionStatus.Disconnected,
  connectionTransport: ConnectionTransport.Wifi,
  connectionMessage: null,
  wifiAddress: '192.168.1.20:8899',
  wifiPlayers: [{ id: 'a', name: 'Living room', address: '192.168.1.20:8899' }],
  bluetoothPlayers: [],
  selectedBluetoothPlayerId: null,
  playerName: 'Compás Player',
  pinDialogVisible: false,
  currentTrack: null,
  catalogSyncMessage: null,
  songActionsVisible: false,
};

function run(states: Partial<SessionSnapshot>[]): (string | null)[] {
  let memory: SessionMemory = initialSessionMemory({ ...base, ...states[0] });
  return states.slice(1).map((partial) => {
    const step = stepSession(memory, { ...base, ...partial });
    memory = step.memory;
    return step.message;
  });
}

const connected = { connectionStatus: ConnectionStatus.Connected, currentTrack: track };

describe('session snackbar events', () => {
  test('announces a new connection with the discovered player name', () => {
    expect(run([{}, { connectionStatus: ConnectionStatus.Connecting }, connected])).toEqual([
      null,
      'Connected to Living room',
    ]);
  });

  test('announces recovery after a drop that kept the current track', () => {
    const messages = run([
      connected,
      { connectionStatus: ConnectionStatus.Connecting, currentTrack: track, connectionMessage: 'Reconnecting to player…' },
      connected,
    ]);
    expect(messages).toEqual([null, 'Reconnected to Living room']);
  });

  test('treats switching to another player as a new connection', () => {
    const messages = run([
      connected,
      { connectionStatus: ConnectionStatus.Connecting, currentTrack: track, wifiAddress: '10.0.0.5' },
      { ...connected, wifiAddress: '10.0.0.5' },
    ]);
    expect(messages).toEqual([null, 'Connected to Compás Player']);
  });

  test('reports an updated PIN instead of a new connection', () => {
    const messages = run([
      connected,
      { ...connected, pinDialogVisible: true },
      { connectionStatus: ConnectionStatus.Connecting, currentTrack: track, pinDialogVisible: true },
      connected,
    ]);
    expect(messages).toEqual([null, null, 'Saved PIN updated']);
  });

  test('reports a finished library sync with the song total', () => {
    const messages = run([
      connected,
      { ...connected, catalogSyncMessage: 'Checking player library' },
      { ...connected, catalogSyncMessage: 'Syncing songs 200/1240' },
      { ...connected, catalogSyncMessage: 'Downloading covers 3/40' },
      connected,
    ]);
    expect(messages).toEqual([null, null, null, 'Library synced · 1240 songs']);
  });

  test('stays quiet when the stored catalog was already current', () => {
    const messages = run([connected, { ...connected, catalogSyncMessage: 'Checking player library' }, connected]);
    expect(messages).toEqual([null, null]);
  });

  test('surfaces new errors only where no screen shows them inline', () => {
    const messages = run([
      connected,
      { ...connected, connectionMessage: 'Could not seek playback.' },
      { ...connected, connectionMessage: 'Could not seek playback.' },
      { ...connected, connectionMessage: 'Could not load library', screen: { type: 'Library', category: LibraryCategory.Albums } },
    ]);
    expect(messages).toEqual(['Could not seek playback.', null, null]);
  });

  test('a PIN that could not be saved is announced instead of the connection', () => {
    const notSaved = { ...connected, connectionMessage: 'The PIN could not be saved on this phone. You will be asked for it again.' };
    expect(run([{}, { connectionStatus: ConnectionStatus.Connecting }, notSaved])).toEqual([
      null,
      'The PIN could not be saved on this phone. You will be asked for it again.',
    ]);
  });

  test('the unsaved-PIN warning is also announced when connecting from the Connection screen', () => {
    const warning = 'The PIN could not be saved on this phone. You will be asked for it again.';
    const onConnection = { screen: { type: 'Connection' } } as Partial<SessionSnapshot>;
    expect(run([
      onConnection,
      { ...onConnection, connectionStatus: ConnectionStatus.Connecting },
      { ...onConnection, ...connected, connectionMessage: warning },
      { ...onConnection, ...connected, connectionMessage: null },
    ])).toEqual([null, warning, null]);
  });
});
