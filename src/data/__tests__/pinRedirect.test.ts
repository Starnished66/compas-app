jest.mock('expo-file-system/legacy', () => ({}));
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async () => { throw new Error('expo-crypto is unavailable under Jest'); },
}));
const mockNative = {
  uploadFile: jest.fn(),
  downloadFile: jest.fn(),
  cancelTransfer: jest.fn(),
  addListener: jest.fn(() => ({ remove: jest.fn() })),
};
jest.mock('../../../modules/compas-files/src', () => ({ getPinSafeTransfers: () => mockNative }));

import { FetchHttpTransport } from '../HttpTransport';
import { uploadFileNative } from '../nativeFileUpload';
import { downloadToFile } from '../fileDownload';
import { PinRedirectError } from '../redirectGuard';
import { RemoteApi } from '../RemoteApi';

const FAKE_PIN = '000000';

describe('PIN is never forwarded on a redirect', () => {
  afterEach(() => { jest.restoreAllMocks(); mockNative.uploadFile.mockReset(); mockNative.downloadFile.mockReset(); });

  it('fetch is told not to follow redirects and a redirect response is an error', async () => {
    const fetchMock = jest.fn(async () => ({ status: 302, statusText: 'Found', headers: new Headers({ location: 'http://other/' }), arrayBuffer: async () => new ArrayBuffer(0) }));
    (globalThis as any).fetch = fetchMock;
    const transport = new FetchHttpTransport('http://player:8899');
    await expect(transport.execute({ method: 'GET', target: '/api/v1/status', headers: { 'X-Compas-PIN': FAKE_PIN } }))
      .rejects.toBeInstanceOf(PinRedirectError);
    expect((fetchMock.mock.calls[0] as any)[1].redirect).toBe('manual');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a redirect from a file download is an error', async () => {
    const transport = new FetchHttpTransport('http://player:8899', 8000, async () => ({ status: 307, headers: {}, errorBody: '' }));
    await expect(transport.download!({ method: 'GET', target: '/api/v1/art', headers: { 'X-Compas-PIN': FAKE_PIN } }, 'file:///cache/a'))
      .rejects.toBeInstanceOf(PinRedirectError);
  });

  it('uploads go through the native client that refuses redirects', async () => {
    mockNative.uploadFile.mockResolvedValue({ status: 201, body: '{}' });
    await uploadFileNative('http://player:8899/up', 'file:///cache/a.flac', { 'X-Compas-PIN': FAKE_PIN }, () => {});
    expect(mockNative.uploadFile).toHaveBeenCalledWith(expect.any(String), 'http://player:8899/up', 'file:///cache/a.flac', { 'X-Compas-PIN': FAKE_PIN });
  });

  it('a redirect status from the native upload is reported by RemoteApi as an error', async () => {
    mockNative.uploadFile.mockResolvedValue({ status: 302, body: '' });
    const api = new RemoteApi({ execute: jest.fn() } as any, FAKE_PIN);
    await expect(api.uploadImportFile('http://player:8899', 'file:///cache/a.flac', '', 'a.flac', () => {}))
      .rejects.toBeInstanceOf(PinRedirectError);
  });

  it('native errors are unwrapped to the original OkHttp text so dropped links are still recognised', async () => {
    const wrapped = Object.assign(new Error("Call to function 'CompasFiles.uploadFile' has been rejected.\n→ Caused by: Failed to connect to /192.0.2.1:8899"), { code: 'ERR_TRANSFER' });
    mockNative.uploadFile.mockRejectedValue(wrapped);
    await expect(uploadFileNative('http://player:8899/up', 'file:///cache/a.flac', {}, () => {}))
      .rejects.toThrow(/^Failed to connect to \/192\.0\.2\.1:8899$/);
  });

  it('a cancelled native upload rejects as cancelled, or after 5 s if native never settles', async () => {
    jest.useFakeTimers();
    try {
      const controller = new AbortController();
      mockNative.uploadFile.mockReturnValue(new Promise(() => {}));
      const pending = uploadFileNative('http://player:8899/up', 'file:///cache/a.flac', {}, () => {}, controller.signal);
      const outcome = expect(pending).rejects.toThrow('Upload cancellation timed out');
      controller.abort();
      expect(mockNative.cancelTransfer).toHaveBeenCalled();
      jest.advanceTimersByTime(5000);
      await outcome;
    } finally {
      jest.useRealTimers();
    }
  });

  it('downloads go through the native client', async () => {
    mockNative.downloadFile.mockResolvedValue({ status: 200, headers: {}, errorBody: '' });
    await downloadToFile('http://player:8899/art', 'file:///cache/a', { 'X-Compas-PIN': FAKE_PIN }, new AbortController().signal);
    expect(mockNative.downloadFile).toHaveBeenCalled();
  });
});
