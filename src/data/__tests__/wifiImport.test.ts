jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async () => { throw new Error('expo-crypto is unavailable under Jest'); },
}));

jest.mock('../nativeFileUpload', () => ({ uploadFileNative: jest.fn() }));

import { createHttpResponse, HttpRequest, HttpTransport } from '../HttpTransport';
import { RemoteApi } from '../RemoteApi';
import { uploadFileNative } from '../nativeFileUpload';

class ScriptedTransport implements HttpTransport {
  readonly requests: HttpRequest[] = [];
  constructor(private readonly responses: ReturnType<typeof createHttpResponse>[]) {}
  async execute(request: HttpRequest) {
    this.requests.push(request);
    const response = this.responses.shift();
    if (!response) throw new Error('Unexpected request');
    return response;
  }
}

describe('RemoteApi Wi-Fi import service', () => {
  it('reads public library identity without sending the saved PIN', async () => {
    const transport = new ScriptedTransport([
      createHttpResponse(200, 'OK', {}, new TextEncoder().encode('{"version":1,"transports":["wifi"],"features":["catalog_sync_v1"],"libraryId":"library-a"}')),
    ]);
    const api = new RemoteApi(transport, '123456');
    await expect(api.capabilities({ omitPin: true })).resolves.toMatchObject({ libraryId: 'library-a' });
    expect(transport.requests[0].target).toBe('/api/v1/capabilities');
    expect(transport.requests[0].headers?.[RemoteApi.PIN_HEADER]).toBeUndefined();
  });

  it('reads status and sends authenticated start and stop requests', async () => {
    const transport = new ScriptedTransport([
      createHttpResponse(200, 'OK', {}, new TextEncoder().encode('{"state":"ready","error":null}')),
      createHttpResponse(202, 'Accepted', {}, new Uint8Array()),
      createHttpResponse(202, 'Accepted', {}, new Uint8Array()),
    ]);
    const api = new RemoteApi(transport, '123456');

    await expect(api.importStatus()).resolves.toEqual({ state: 'ready', error: null });
    await api.startImport();
    await api.stopImport();

    expect(transport.requests.map(({ method, target }) => [method, target])).toEqual([
      ['GET', '/api/v1/import'],
      ['POST', '/api/v1/import/start'],
      ['POST', '/api/v1/import/stop'],
    ]);
    expect(transport.requests.every((request) => request.headers?.[RemoteApi.PIN_HEADER] === '123456')).toBe(true);
  });

  it('rejects malformed status and non-202 lifecycle responses', async () => {
    const transport = new ScriptedTransport([
      createHttpResponse(200, 'OK', {}, new TextEncoder().encode('{"state":"running"}')),
      createHttpResponse(200, 'OK', {}, new Uint8Array()),
    ]);
    const api = new RemoteApi(transport);
    await expect(api.importStatus()).rejects.toThrow('Invalid Wi-Fi import status response');
    await expect(api.startImport()).rejects.toThrow('HTTP 200');
  });

  it('lists SD entries and sends rename and delete operations through the authenticated player API', async () => {
    const transport = new ScriptedTransport([
      createHttpResponse(200, 'OK', {}, new TextEncoder().encode(JSON.stringify({ path: '', entries: [{ name: 'Music', path: 'Music', isDirectory: true, size: 0 }], offset: 0, next_offset: null, total: 1 }))),
      createHttpResponse(200, 'OK', {}, new Uint8Array()),
      createHttpResponse(200, 'OK', {}, new Uint8Array()),
    ]);
    const api = new RemoteApi(transport, '123456');
    await expect(api.importFiles('', 0, 50)).resolves.toMatchObject({ path: '', entries: [{ name: 'Music', isDirectory: true }] });
    await api.renameImportFile('Music/old.mp3', 'new.mp3');
    await api.deleteImportFile('Music/new.mp3');
    expect(transport.requests.map((request) => request.target)).toEqual([
      '/api/v1/import/files?path=&offset=0&limit=50',
      '/api/v1/import/files/rename?path=Music%2Fold.mp3&name=new.mp3',
      '/api/v1/import/files/delete?path=Music%2Fnew.mp3',
    ]);
    expect(transport.requests.every((request) => request.headers?.[RemoteApi.PIN_HEADER] === '123456')).toBe(true);
  });

  it('streams a raw local file to 8899 with the saved PIN and never builds a JS file buffer', async () => {
    const transport = new ScriptedTransport([]);
    const api = new RemoteApi(transport, '123456');
    const mockedUpload = jest.mocked(uploadFileNative);
    mockedUpload.mockImplementationOnce(async (_url, _uri, _headers, onProgress) => {
      onProgress({ sent: 7, total: 7 });
      return { status: 201, body: '{"ok":true,"path":"Music","name":"song.mp3","bytes":7}' };
    });
    const progress = jest.fn();
    await expect(api.uploadImportFile('http://192.168.1.9:8899', 'file:///cache/song.mp3', 'Music', 'song.mp3', progress, new AbortController().signal))
      .resolves.toEqual({ ok: true, path: 'Music', name: 'song.mp3', bytes: 7 });
    expect(mockedUpload).toHaveBeenCalledWith(
      'http://192.168.1.9:8899/api/v1/import/files/upload?path=Music&name=song.mp3',
      'file:///cache/song.mp3',
      { 'Content-Type': 'application/octet-stream', [RemoteApi.PIN_HEADER]: '123456' },
      expect.any(Function),
      expect.any(AbortSignal),
    );
    expect(progress).toHaveBeenCalledWith({ sent: 7, total: 7 });
  });

  it('keeps a conflicting upload as a 409 so the manager can offer a rename or another folder', async () => {
    const api = new RemoteApi(new ScriptedTransport([]));
    jest.mocked(uploadFileNative).mockResolvedValueOnce({ status: 409, body: 'File exists' });
    await expect(api.uploadImportFile('http://192.168.1.9:8899', 'file:///cache/song.mp3', '', 'song.mp3', () => {}, new AbortController().signal))
      .rejects.toMatchObject({ statusCode: 409 });
  });
});
