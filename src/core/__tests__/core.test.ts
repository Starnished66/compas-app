import { normalizeWifiAddress, DEFAULT_PLAYER_PORT } from '../endpoint';
import { StreamHttpParser, HttpRequest, HttpResponse, HttpTransport } from '../transport';
import { RemoteApi } from '../api';
import { RemoteApiException } from '../errors';
import { PlaybackStatusGate, CommandOutcome } from '../playbackStatusGate';
import {
  BluetoothRequestPolicy,
  prioritizeCatalogItems,
  matchesStoredCatalogSnapshot,
  canFinishCatalogSyncFromSnapshot,
} from '../policies';

describe('RemoteEndpoint', () => {
  test('normalizes standard IP address with default port', () => {
    expect(normalizeWifiAddress('192.168.1.50')).toBe(`http://192.168.1.50:${DEFAULT_PLAYER_PORT}`);
  });

  test('normalizes IP address with custom port', () => {
    expect(normalizeWifiAddress('192.168.1.50:9000')).toBe('http://192.168.1.50:9000');
  });

  test('accepts http:// scheme and strips trailing slash', () => {
    expect(normalizeWifiAddress('http://10.0.0.2/')).toBe(`http://10.0.0.2:${DEFAULT_PLAYER_PORT}`);
  });

  test('formats IPv6 host in brackets', () => {
    expect(normalizeWifiAddress('fe80::1')).toBe(`http://[fe80::1]:${DEFAULT_PLAYER_PORT}`);
  });

  test('rejects non-http scheme', () => {
    expect(() => normalizeWifiAddress('https://192.168.1.50')).toThrow('Use an http:// player address');
    expect(() => normalizeWifiAddress('ftp://192.168.1.50')).toThrow('Use an http:// player address');
  });

  test('rejects path or query in input', () => {
    expect(() => normalizeWifiAddress('192.168.1.50/api')).toThrow('Enter only the player\'s IP address and optional port');
    expect(() => normalizeWifiAddress('192.168.1.50?query=1')).toThrow('Enter only the player\'s IP address and optional port');
  });

  test('rejects invalid ports', () => {
    expect(() => normalizeWifiAddress('192.168.1.50:70000')).toThrow();
  });
});

describe('StreamHttpParser', () => {
  test('parses standard HTTP/1.1 response with JSON body', () => {
    const raw =
      'HTTP/1.1 200 OK\r\n' +
      'Content-Type: application/json\r\n' +
      'Content-Length: 18\r\n' +
      'Connection: close\r\n' +
      '\r\n' +
      '{"status":"ready"}';

    const bytes = new TextEncoder().encode(raw);
    const parsed = StreamHttpParser.parseResponse(bytes);

    expect(parsed.statusCode).toBe(200);
    expect(parsed.reason).toBe('OK');
    expect(parsed.header('content-type')).toBe('application/json');
    expect(parsed.header('content-length')).toBe('18');
    expect(parsed.text()).toBe('{"status":"ready"}');
  });

  test('throws on truncated headers', () => {
    const raw = 'HTTP/1.1 200 OK\r\nContent-Length: 5\r\n';
    const bytes = new TextEncoder().encode(raw);
    expect(() => StreamHttpParser.parseResponse(bytes)).toThrow('Truncated HTTP headers');
  });

  test('throws on missing Content-Length', () => {
    const raw = 'HTTP/1.1 200 OK\r\nConnection: close\r\n\r\nHello';
    const bytes = new TextEncoder().encode(raw);
    expect(() => StreamHttpParser.parseResponse(bytes)).toThrow('Missing or invalid Content-Length');
  });

  test('throws on truncated body', () => {
    const raw = 'HTTP/1.1 200 OK\r\nContent-Length: 20\r\n\r\nShort';
    const bytes = new TextEncoder().encode(raw);
    expect(() => StreamHttpParser.parseResponse(bytes)).toThrow('Truncated HTTP body');
  });
});

describe('RemoteApi', () => {
  let mockTransport: jest.Mocked<HttpTransport>;
  let api: RemoteApi;

  beforeEach(() => {
    mockTransport = {
      execute: jest.fn(),
    };
    api = new RemoteApi(mockTransport, '123456');
  });

  test('enforces 4-12 digit PIN', () => {
    expect(() => new RemoteApi(mockTransport, '123')).toThrow('PIN must contain 4 to 12 digits');
    expect(() => new RemoteApi(mockTransport, '1234567890123')).toThrow('PIN must contain 4 to 12 digits');
    expect(() => new RemoteApi(mockTransport, 'abcd')).toThrow('PIN must contain 4 to 12 digits');
    expect(new RemoteApi(mockTransport, '1234').pin).toBe('1234');
    expect(new RemoteApi(mockTransport, null).pin).toBeNull();
  });

  test('calls /status and parses fields including bluetooth_audio_output', async () => {
    const body = JSON.stringify({
      playing: true,
      paused: false,
      title: 'Song Title',
      artist: 'Artist Name',
      album: 'Album Name',
      position_seconds: 42,
      duration_seconds: 240,
      volume: 0.75,
      play_mode: 1,
      codec: 'FLAC',
      source_bit_depth: 24,
      source_sample_rate: 96000,
      bluetooth_audio_output: true,
    });
    mockTransport.execute.mockResolvedValueOnce(
      new HttpResponse(200, 'OK', { 'content-type': 'application/json' }, new TextEncoder().encode(body))
    );

    const status = await api.status();
    expect(status.playing).toBe(true);
    expect(status.title).toBe('Song Title');
    expect(status.codec).toBe('FLAC');
    expect(status.sourceBitDepth).toBe(24);
    expect(status.sourceSampleRateHz).toBe(96000);
    expect(status.bluetoothAudioOutput).toBe(true);

    expect(mockTransport.execute).toHaveBeenCalledWith({
      method: 'GET',
      target: '/api/v1/status',
      headers: { 'X-Compas-PIN': '123456' },
    });
  });

  test('handles 401 pin_required exception', async () => {
    const errBody = JSON.stringify({ error: 'unauthorized', code: 'pin_required' });
    mockTransport.execute.mockResolvedValueOnce(
      new HttpResponse(401, 'Unauthorized', { 'content-type': 'application/json' }, new TextEncoder().encode(errBody))
    );

    await expect(api.status()).rejects.toThrow(RemoteApiException);
    mockTransport.execute.mockResolvedValueOnce(
      new HttpResponse(401, 'Unauthorized', { 'content-type': 'application/json' }, new TextEncoder().encode(errBody))
    );
    try {
      await api.status();
    } catch (e: any) {
      expect(e.pinRequired).toBe(true);
      expect(e.pinRateLimited).toBe(false);
    }
  });

  test('handles 429 pin_rate_limited with retry-after', async () => {
    const errBody = JSON.stringify({ error: 'rate_limited', code: 'pin_rate_limited', retryAfterSeconds: 45 });
    mockTransport.execute.mockResolvedValueOnce(
      new HttpResponse(429, 'Too Many Requests', { 'content-type': 'application/json' }, new TextEncoder().encode(errBody))
    );

    try {
      await api.status();
    } catch (e: any) {
      expect(e.pinRateLimited).toBe(true);
      expect(e.retryAfterSeconds).toBe(45);
    }
  });

  test('play command builds correct query with context and revision', async () => {
    mockTransport.execute.mockResolvedValueOnce(
      new HttpResponse(200, 'OK', {}, new TextEncoder().encode('OK'))
    );

    await api.play(105, { artist: 'Daft Punk', album: 'Discovery' }, 'lib-1:rev-2');

    expect(mockTransport.execute).toHaveBeenCalledWith({
      method: 'POST',
      target: '/api/v1/playback/play?index=105&artist=Daft%20Punk&album=Discovery&catalog_revision=lib-1%3Arev-2',
      headers: { 'X-Compas-PIN': '123456' },
    });
  });

  test('catalog response validates page range and counts', async () => {
    const pageData = {
      library_id: 'uuid-1234',
      revision: 'uuid-1234:1',
      total: 2,
      offset: 0,
      next_offset: 2,
      songs: [
        {
          id: 1,
          title: 'Song 1',
          artist: 'Artist 1',
          album: 'Album 1',
          album_artist: 'Artist 1',
          genre: 'Rock',
          track_number: 1,
          disc_number: 1,
          album_key: 'a2-abc',
          artists: ['Artist 1'],
        },
        {
          id: 2,
          title: 'Song 2',
          artist: 'Artist 2',
          album: 'Album 2',
          album_artist: 'Artist 2',
          genre: 'Pop',
          track_number: 2,
          disc_number: 1,
          album_key: 'a2-def',
          artists: ['Artist 2'],
        },
      ],
    };

    mockTransport.execute.mockResolvedValueOnce(
      new HttpResponse(200, 'OK', { 'content-type': 'application/json' }, new TextEncoder().encode(JSON.stringify(pageData)))
    );

    const catalog = await api.catalog(0, 50);
    expect(catalog.libraryId).toBe('uuid-1234');
    expect(catalog.total).toBe(2);
    expect(catalog.songs.length).toBe(2);
    expect(catalog.songs[0]?.albumKey).toBe('a2-abc');
  });
});

describe('PlaybackStatusGate', () => {
  test('optimistic toggle flips confirmed playback and confirms on matching status', () => {
    const gate = new PlaybackStatusGate(5000);
    expect(gate.confirmedPlayback).toBe(false);

    // Initial confirmed status: not playing
    const snap0 = gate.snapshot();
    expect(gate.confirmStatus(snap0, false, 1000)).toBe(true);

    // User taps play/toggle
    const actId = gate.beginAction();
    expect(gate.hasUnconfirmedAction).toBe(true);

    // Command completes successfully
    const expected = gate.finishAction(actId, CommandOutcome.Succeeded, 1050);
    expect(expected).toBe(true);

    // Stale status reading before tap was finished (e.g. read started before tap)
    expect(gate.confirmStatus(snap0, false, 1060)).toBe(false);

    // Fresh status taken after tap: status confirms playing!
    const snap1 = gate.snapshot();
    expect(gate.confirmStatus(snap1, true, 1100)).toBe(true);
    expect(gate.confirmedPlayback).toBe(true);
    expect(gate.hasUnconfirmedAction).toBe(false);
  });

  test('explicit play command overrides prior toggle', () => {
    const gate = new PlaybackStatusGate(5000);
    gate.confirmStatus(gate.snapshot(), false, 1000);

    const t1 = gate.beginAction(); // toggle (false -> true)
    const t2 = gate.beginExplicitAction(false); // explicit set false

    gate.finishAction(t1, CommandOutcome.Succeeded, 1010);
    const finalExpected = gate.finishAction(t2, CommandOutcome.Succeeded, 1020);
    expect(finalExpected).toBe(false);
  });

  test('grace period lets authoritative status win after timeout', () => {
    const gate = new PlaybackStatusGate(1000); // 1s grace
    gate.confirmStatus(gate.snapshot(), false, 1000);

    const actId = gate.beginAction();
    gate.finishAction(actId, CommandOutcome.Succeeded, 1000); // expected: true

    // Reading at 1500 ms (within grace): status still reports false -> rejected
    const snap1 = gate.snapshot();
    expect(gate.confirmStatus(snap1, false, 1500)).toBe(false);

    // Reading at 2500 ms (grace expired): authoritative status wins
    const snap2 = gate.snapshot();
    expect(gate.confirmStatus(snap2, false, 2500)).toBe(true);
    expect(gate.confirmedPlayback).toBe(false);
    expect(gate.hasUnconfirmedAction).toBe(false);
  });
});

describe('BluetoothRequestPolicy', () => {
  test('identifies bluetooth audio priority', () => {
    expect(BluetoothRequestPolicy.requiresBluetoothAudioPriority('bluetooth', true)).toBe(true);
    expect(BluetoothRequestPolicy.requiresBluetoothAudioPriority('bluetooth', null)).toBe(true);
    expect(BluetoothRequestPolicy.requiresBluetoothAudioPriority('bluetooth', false)).toBe(false);
    expect(BluetoothRequestPolicy.requiresBluetoothAudioPriority('wifi', true)).toBe(false);
  });

  test('throttles polling interval during bluetooth audio', () => {
    expect(BluetoothRequestPolicy.statusPollInterval('wifi', 1000, true)).toBe(1000);
    expect(BluetoothRequestPolicy.statusPollInterval('bluetooth', 1000, true)).toBe(5000);
    expect(BluetoothRequestPolicy.statusPollInterval('bluetooth', 1000, false)).toBe(1000);
  });

  test('defers artwork requests during active bluetooth playback', () => {
    expect(BluetoothRequestPolicy.allowsArtworkRequest('bluetooth', true, true)).toBe(false);
    expect(BluetoothRequestPolicy.allowsArtworkRequest('bluetooth', false, true)).toBe(true);
    expect(BluetoothRequestPolicy.allowsArtworkRequest('bluetooth', true, false)).toBe(true);
    expect(BluetoothRequestPolicy.allowsArtworkRequest('wifi', true, true)).toBe(true);
  });
});

describe('CatalogSyncPolicy', () => {
  test('prioritizes catalog items based on priority keys preserving ties', () => {
    const items = [
      { id: 1, key: 'c' },
      { id: 2, key: 'a' },
      { id: 3, key: 'b' },
      { id: 4, key: 'a' },
      { id: 5, key: 'd' },
    ];

    const sorted = prioritizeCatalogItems(items, ['a', 'b'], (x) => x.key);
    expect(sorted.map((x) => x.id)).toEqual([2, 4, 3, 1, 5]);
  });

  test('matchesStoredCatalogSnapshot validates exact revision, libraryId, and counts', () => {
    expect(
      matchesStoredCatalogSnapshot(
        'lib-1',
        'rev-1',
        100,
        'lib-1',
        'rev-1',
        100,
        100
      )
    ).toBe(true);

    expect(
      matchesStoredCatalogSnapshot(
        'lib-1',
        'rev-2',
        100,
        'lib-1',
        'rev-1',
        100,
        100
      )
    ).toBe(false);

    expect(
      matchesStoredCatalogSnapshot(
        'lib-1',
        'rev-1',
        100,
        'lib-1',
        'rev-1',
        100,
        99
      )
    ).toBe(false);
  });

  test('canFinishCatalogSyncFromSnapshot checks completeness', () => {
    expect(canFinishCatalogSyncFromSnapshot(false, true, 0)).toBe(true);
    expect(canFinishCatalogSyncFromSnapshot(true, true, 0)).toBe(false);
    expect(canFinishCatalogSyncFromSnapshot(false, false, 0)).toBe(false);
    expect(canFinishCatalogSyncFromSnapshot(false, true, 5)).toBe(false);
  });
});
