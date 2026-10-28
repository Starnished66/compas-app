import { createHttpResponse, HttpRequest, HttpResponse, HttpTransport } from '../HttpTransport';
import { mapSettingsError, SettingsApi, SettingsApiError } from '../SettingsApi';

const json = (status: number, value: unknown): HttpResponse =>
  createHttpResponse(status, 'x', { 'content-type': 'application/json' }, new TextEncoder().encode(JSON.stringify(value)));

class Scripted implements HttpTransport {
  readonly requests: HttpRequest[] = [];
  constructor(private readonly responses: HttpResponse[]) {}
  async execute(request: HttpRequest): Promise<HttpResponse> {
    this.requests.push(request);
    const next = this.responses.shift();
    if (!next) throw new Error('no scripted response');
    return next;
  }
}

const SCHEMA = {
  schemaVersion: 1,
  device: { model: 'HiBy R1', board: 'r1', playerVersion: '1.3.0' },
  groups: [{ id: 'sound', label: 'Sound', labelId: 'Sound' }],
  settings: [
    { key: 'max_volume_percent', group: 'sound', label: 'Max Volume', labelId: 'Max Volume', type: 'percent', apply: 'live', available: true, min: 1, max: 100, unit: '%', confirmAbove: 85 },
    { key: 'wifi_enabled', group: 'sound', label: 'Wi-Fi', labelId: 'Wi-Fi', type: 'bool', apply: 'live', available: true, readOnly: true, reason: 'would_lock_out_remote' },
  ],
  actions: [{ id: 'library.rescan', group: 'library', label: 'Update Music Database', labelId: 'Update Music Database' }],
};

function client(...responses: HttpResponse[]) {
  const transport = new Scripted(responses);
  let pin: string | null = '123456';
  return { api: new SettingsApi(transport, () => pin), transport, setPin: (p: string | null) => { pin = p; } };
}

describe('SettingsApi', () => {
  it('parses the schema once and reuses it', async () => {
    const { api, transport } = client(json(200, SCHEMA));
    const first = await api.schema();
    expect(first.settings[0]).toMatchObject({ key: 'max_volume_percent', type: 'percent', min: 1, max: 100, confirmAbove: 85, readOnly: false });
    expect(first.settings[1]).toMatchObject({ readOnly: true, reason: 'would_lock_out_remote' });
    expect(first.actions[0].id).toBe('library.rescan');
    expect(await api.schema()).toBe(first);
    expect(transport.requests).toHaveLength(1);
    expect(transport.requests[0]).toMatchObject({ method: 'GET', target: '/api/v1/settings/schema', headers: { 'X-Compas-PIN': '123456' } });
  });

  it('asks for a delta with since and epoch, and for everything without them', async () => {
    const { api, transport } = client(
      json(200, { epoch: 7, revision: 5, full: true, writable: false, values: { a: 1 } }),
      json(200, { epoch: 7, revision: 6, full: false, writable: true, values: { a: 2 } }),
    );
    expect(await api.values()).toMatchObject({ epoch: 7, revision: 5, full: true, writable: false });
    expect(await api.values({ revision: 5, epoch: 7 })).toMatchObject({ full: false, writable: true, values: { a: 2 } });
    expect(transport.requests[0].target).toBe('/api/v1/settings');
    expect(transport.requests[1].target).toBe('/api/v1/settings?since=5&epoch=7');
  });

  it('posts JSON with the PIN header, base revision, epoch and acknowledge', async () => {
    const { api, transport } = client(json(200, { epoch: 7, revision: 9, applied: ['max_volume_percent'], pending: [{ key: 'replaygain_mode', reason: 'next_track' }], alsoChanged: [] }));
    const result = await api.write({ changes: { max_volume_percent: 90 }, baseRevision: 8, epoch: 7, acknowledge: ['max_volume_percent'] });
    expect(result).toMatchObject({ revision: 9, applied: ['max_volume_percent'], pending: [{ key: 'replaygain_mode', reason: 'next_track' }] });
    const request = transport.requests[0];
    expect(request.method).toBe('POST');
    expect(request.headers).toMatchObject({ 'X-Compas-PIN': '123456', 'Content-Type': 'application/json' });
    expect(JSON.parse(new TextDecoder().decode(request.body))).toEqual({
      changes: { max_volume_percent: 90 }, baseRevision: 8, epoch: 7, acknowledge: ['max_volume_percent'],
    });
    expect(request.headers!['Content-Length']).toBe(String(request.body!.length));
  });

  it('gives writes a longer timeout than the transport default and leaves reads alone', async () => {
    const { api, transport } = client(json(200, { epoch: 1, revision: 1, applied: [], pending: [], alsoChanged: [] }), json(200, { epoch: 1, revision: 1, full: true, writable: true, values: {} }), json(202, {}));
    await api.write({ changes: { a: true } });
    await api.values();
    await api.runAction('library.rescan');
    expect(transport.requests[0].timeoutMs).toBeGreaterThanOrEqual(15_000);
    expect(transport.requests[1].timeoutMs).toBeUndefined();
    expect(transport.requests[2].timeoutMs).toBeUndefined();
  });

  it('sends baseRevision and epoch together or not at all, and omits an empty acknowledge', async () => {
    const { api, transport } = client(json(200, { epoch: 1, revision: 1, applied: [], pending: [], alsoChanged: [] }));
    await api.write({ changes: { a: true }, baseRevision: 3, acknowledge: [] });
    expect(JSON.parse(new TextDecoder().decode(transport.requests[0].body))).toEqual({ changes: { a: true } });
  });

  it('follows a changed PIN and sends no header when there is none', async () => {
    const { api, transport, setPin } = client(json(200, { epoch: 1, revision: 1, full: true, writable: true, values: {} }));
    setPin(null);
    await api.values();
    expect(transport.requests[0].headers).toEqual({});
  });

  it('starts an action with an empty JSON body and accepts only 202', async () => {
    const { api, transport } = client(json(202, { accepted: true }), json(200, {}));
    await expect(api.runAction('library.rescan')).resolves.toBeUndefined();
    expect(transport.requests[0]).toMatchObject({ method: 'POST', target: '/api/v1/settings/actions/library.rescan' });
    await expect(api.runAction('library.rescan')).rejects.toBeInstanceOf(SettingsApiError);
    await expect(api.runAction('../x')).rejects.toThrow('Invalid action id');
  });

  it('never puts the PIN in an error', async () => {
    const { api } = client(json(401, { error: 'settings_error', code: 'pin_required' }));
    const error = await api.values().catch((e) => e);
    expect(error).toBeInstanceOf(SettingsApiError);
    expect(JSON.stringify(error)).not.toContain('123456');
    expect(String(error.message)).not.toContain('123456');
  });
});

describe('settings error mapping', () => {
  const kind = (status: number, body: unknown) => mapSettingsError(json(status, body)).kind;

  it('maps the documented statuses and codes', () => {
    expect(kind(401, { code: 'pin_required' })).toBe('pin_required');
    expect(kind(401, { code: 'header_auth_required' })).toBe('pin_required');
    expect(kind(403, { code: 'remote_changes_disabled' })).toBe('switch_off');
    expect(kind(423, {})).toBe('switch_off');
    expect(kind(409, { code: 'rescan_running' })).toBe('rescan_running');
    expect(kind(409, { code: 'settings_busy' })).toBe('busy');
    expect(kind(503, { code: 'player_busy' })).toBe('player_busy');
    expect(kind(405, { code: 'method_not_allowed' })).toBe('unsupported');
    expect(kind(404, 'x')).toBe('unsupported');
    expect(kind(500, { code: 'out_of_memory' })).toBe('unknown');
  });

  it('reads per-key validation errors', () => {
    const error = mapSettingsError(json(422, { code: 'validation_failed', errors: [{ key: 'max_volume_percent', code: 'confirmation_required', confirmAbove: 85 }] }));
    expect(error.kind).toBe('confirmation_required');
    expect(error.keyErrors).toEqual([{ key: 'max_volume_percent', code: 'confirmation_required', confirmAbove: 85 }]);
    expect(kind(403, { code: 'validation_failed', errors: [{ key: 'wifi_enabled', code: 'read_only' }] })).toBe('read_only');
    const range = mapSettingsError(json(422, { code: 'validation_failed', errors: [{ key: 'a', code: 'out_of_range', min: 1, max: 5 }] }));
    expect(range.kind).toBe('validation');
    expect(range.keyErrors[0]).toMatchObject({ min: 1, max: 5 });
  });

  it('carries the current values of a revision mismatch', () => {
    const error = mapSettingsError(json(409, { code: 'revision_mismatch', current: { epoch: 4, revision: 12, full: true, writable: true, values: { a: 1 } } }));
    expect(error.kind).toBe('revision_mismatch');
    expect(error.current).toMatchObject({ epoch: 4, revision: 12, values: { a: 1 } });
  });

  it('copes with a body that is not JSON', () => {
    const response = createHttpResponse(502, 'Bad Gateway', {}, new TextEncoder().encode('<html>'));
    expect(mapSettingsError(response).kind).toBe('unknown');
  });
});
