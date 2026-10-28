jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async () => { throw new Error('expo-crypto is unavailable under Jest'); },
}));

import { createHttpResponse, HttpRequest, HttpResponse, HttpTransport } from '../HttpTransport';
import { RemoteApi } from '../RemoteApi';

const reply = (body: unknown): HttpResponse =>
  createHttpResponse(200, 'OK', {}, new TextEncoder().encode(JSON.stringify(body)));

describe('settings revision in the status poll', () => {
  const statusWith = async (extra: Record<string, unknown>) => {
    const transport: HttpTransport = { execute: async (_r: HttpRequest) => reply({ playing: false, ...extra }) };
    return new RemoteApi(transport, '123456').status();
  };

  it('reads settingsRevision and settingsEpoch', async () => {
    expect(await statusWith({ settingsRevision: 42, settingsEpoch: 123456789 })).toMatchObject({ settingsRevision: 42, settingsEpoch: 123456789 });
  });

  it('leaves them null on a player without settings', async () => {
    expect(await statusWith({})).toMatchObject({ settingsRevision: null, settingsEpoch: null });
  });

  it('hands out one settings client per connection that follows PIN changes', async () => {
    const seen: Array<string | undefined> = [];
    const transport: HttpTransport = { execute: async (r: HttpRequest) => { seen.push(r.headers?.['X-Compas-PIN']); return reply({ epoch: 1, revision: 1, full: true, writable: true, values: {} }); } };
    const api = new RemoteApi(transport, '111111');
    expect(api.settings()).toBe(api.settings());
    await api.settings().values();
    api.setPin('222222');
    await api.settings().values();
    expect(seen).toEqual(['111111', '222222']);
  });
});
