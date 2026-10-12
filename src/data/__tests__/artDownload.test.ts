jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async () => {
    throw new Error('expo-crypto is unavailable under Jest');
  },
}));

import {
  ArtworkRequestPreemptedException,
  createHttpResponse,
  FetchHttpTransport,
  FileDownloader,
  HttpRequest,
  HttpResponse,
  HttpTransport,
  SerializedHttpTransport,
} from '../HttpTransport';
import { RemoteApi, RemoteApiException } from '../RemoteApi';

function jsonResponse(statusCode: number, json: unknown): HttpResponse {
  return createHttpResponse(statusCode, '', {}, new TextEncoder().encode(JSON.stringify(json)));
}

function downloaderReturning(status: number, errorBody = '') {
  const calls: Array<{ url: string; fileUri: string; headers: Record<string, string> }> = [];
  const download: FileDownloader = async (url, fileUri, headers) => {
    calls.push({ url, fileUri, headers });
    return { status, headers: { 'Content-Type': 'image/png' }, errorBody };
  };
  return { calls, download };
}

function wifiApi(download: FileDownloader, pin?: string) {
  return new RemoteApi(new SerializedHttpTransport(new FetchHttpTransport('http://player:8899/', 8000, download)), pin);
}

class ScriptedTransport implements HttpTransport {
  readonly requests: Array<{ request: HttpRequest; resolve(response: HttpResponse): void }> = [];

  execute(request: HttpRequest): Promise<HttpResponse> {
    return new Promise((resolve) => this.requests.push({ request, resolve }));
  }
}

describe('art downloads', () => {
  it('downloads the current artwork straight to a file with the PIN header', async () => {
    const downloader = downloaderReturning(200);
    const api = wifiApi(downloader.download, '1234');

    expect(api.canDownloadArt).toBe(true);
    await expect(api.downloadArt('file:///cache/a.tmp')).resolves.toBe(true);
    expect(downloader.calls).toEqual([
      { url: 'http://player:8899/api/v1/art', fileUri: 'file:///cache/a.tmp', headers: { [RemoteApi.PIN_HEADER]: '1234' } },
    ]);
  });

  it('reports missing artwork', async () => {
    await expect(wifiApi(downloaderReturning(404).download).downloadArt('file:///a.tmp')).resolves.toBe(false);
  });

  it('surfaces PIN errors from the downloaded body', async () => {
    const api = wifiApi(downloaderReturning(401, JSON.stringify({ code: 'pin_required' })).download);
    const error = await api.downloadArt('file:///a.tmp').catch((err: unknown) => err);
    expect(error).toBeInstanceOf(RemoteApiException);
    expect((error as RemoteApiException).pinRequired).toBe(true);
  });

  it('aborts an in-flight download when artwork is preempted', async () => {
    const download: FileDownloader = (_url, _fileUri, _headers, signal) =>
      new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('cancelled'))));
    const api = wifiApi(download);
    const pending = api.downloadArt('file:///a.tmp');
    await Promise.resolve();
    api.preemptArtworkRequest();
    await expect(pending).rejects.toBeInstanceOf(ArtworkRequestPreemptedException);
  });

  it('is unavailable on transports without file downloads', () => {
    const api = new RemoteApi(new SerializedHttpTransport(new ScriptedTransport()));
    expect(api.canDownloadArt).toBe(false);
  });

  it('reuses the transport base64 body instead of re-encoding it', async () => {
    const transport: HttpTransport = {
      execute: async () => ({ ...createHttpResponse(200, 'OK', { 'content-type': 'image/png' }, new Uint8Array()), bodyBase64: 'iVBORw==' }),
    };
    await expect(new RemoteApi(transport).art(null)).resolves.toEqual({ contentType: 'image/png', base64: 'iVBORw==' });
  });
});

describe('SerializedHttpTransport preemption', () => {
  it('drops queued now-playing artwork so it cannot run after a track change', async () => {
    const inner = new ScriptedTransport();
    const api = new RemoteApi(new SerializedHttpTransport(inner));

    const status = api.status();
    const art = api.art(null).catch((err: unknown) => err);
    await Promise.resolve();
    expect(inner.requests.map((entry) => entry.request.target)).toEqual(['/api/v1/status']);

    const next = api.next();
    expect(await art).toBeInstanceOf(ArtworkRequestPreemptedException);

    inner.requests[0].resolve(jsonResponse(200, { title: 'A' }));
    await expect(status).resolves.toMatchObject({ title: 'A' });
    await Promise.resolve();
    await Promise.resolve();
    expect(inner.requests.map((entry) => entry.request.target)).toEqual(['/api/v1/status', '/api/v1/playback/next']);
    inner.requests[1].resolve(jsonResponse(200, {}));
    await next;
  });

  it('keeps queued library artwork requests', async () => {
    const inner = new ScriptedTransport();
    const api = new RemoteApi(new SerializedHttpTransport(inner));

    void api.status();
    const songArt = api.art(7);
    await Promise.resolve();
    api.preemptArtworkRequest();
    inner.requests[0].resolve(jsonResponse(200, {}));
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(inner.requests.map((entry) => entry.request.target)).toEqual(['/api/v1/status', '/api/v1/art?index=7']);
    inner.requests[1].resolve(createHttpResponse(404, 'Not Found', {}, new Uint8Array()));
    await expect(songArt).resolves.toBeNull();
  });
});
