import { HttpRequest, HttpResponse, HttpTransport } from './HttpTransport';
import {
  parseSchema,
  parseSnapshot,
  parseWriteResult,
  SettingsSchema,
  SettingsSnapshot,
  SettingsWriteRequest,
  SettingsWriteResult,
} from '../core/settingsModels';

export type SettingsErrorKind =
  | 'pin_required'
  | 'read_only'
  | 'revision_mismatch'
  | 'rescan_running'
  | 'busy'
  | 'player_busy'
  | 'confirmation_required'
  | 'validation'
  | 'unsupported'
  | 'unknown';

export interface SettingsKeyError {
  key: string;
  code: string;
  min?: number;
  max?: number;
  confirmAbove?: number;
}

/** A failed settings call. Carries only the player's error codes, never the PIN or the request headers. */
export class SettingsApiError extends Error {
  constructor(
    readonly kind: SettingsErrorKind,
    readonly status: number,
    readonly code: string,
    readonly keyErrors: SettingsKeyError[] = [],
    /** Fresh values the player sent with a 409 revision_mismatch. */
    readonly current: SettingsSnapshot | null = null,
  ) {
    super(`Player settings request failed: HTTP ${status} ${code}`);
    this.name = 'SettingsApiError';
  }
}

function parseBody(response: HttpResponse): any {
  try {
    return JSON.parse(response.text());
  } catch {
    return null;
  }
}

function keyErrorsOf(body: any): SettingsKeyError[] {
  if (!body || !Array.isArray(body.errors)) return [];
  return body.errors
    .filter((e: any) => e && typeof e.key === 'string' && typeof e.code === 'string')
    .map((e: any) => ({
      key: e.key,
      code: e.code,
      ...(Number.isFinite(e.min) ? { min: e.min } : {}),
      ...(Number.isFinite(e.max) ? { max: e.max } : {}),
      ...(Number.isFinite(e.confirmAbove) ? { confirmAbove: e.confirmAbove } : {}),
    }));
}

/** Map an HTTP error answer to a SettingsApiError. Exported for tests. */
export function mapSettingsError(response: HttpResponse): SettingsApiError {
  const status = response.statusCode;
  const body = parseBody(response);
  const code = typeof body?.code === 'string' ? body.code : '';
  const keyErrors = keyErrorsOf(body);
  if (code === 'revision_mismatch') {
    let current: SettingsSnapshot | null = null;
    try {
      current = body.current ? parseSnapshot(body.current) : null;
    } catch {
      current = null;
    }
    return new SettingsApiError('revision_mismatch', status, code, keyErrors, current);
  }
  if (code === 'validation_failed') {
    const kind: SettingsErrorKind = keyErrors.some((e) => e.code === 'confirmation_required') ? 'confirmation_required'
      : keyErrors.length > 0 && keyErrors.every((e) => e.code === 'read_only') ? 'read_only' : 'validation';
    return new SettingsApiError(kind, status, code, keyErrors);
  }
  if (code === 'pin_required' || code === 'header_auth_required' || status === 401) return new SettingsApiError('pin_required', status, code || 'pin_required');
  if (code === 'rescan_running') return new SettingsApiError('rescan_running', status, code);
  if (code === 'settings_busy') return new SettingsApiError('busy', status, code);
  if (code === 'player_busy' || status === 503) return new SettingsApiError('player_busy', status, code || 'player_busy');
  if (status === 403 && code === 'read_only') return new SettingsApiError('read_only', status, code);
  if (status === 404 || status === 405) return new SettingsApiError('unsupported', status, code || 'unsupported');
  return new SettingsApiError('unknown', status, code || 'unknown');
}

/** Client for /api/v1/settings. Reads the PIN through a getter so it follows PIN changes and is never stored here. */
export class SettingsApi {
  private static readonly PIN_HEADER = 'X-Compas-PIN';
  private static readonly PREFIX = '/api/v1/settings';
  /** The player may take 1.5 s to start and 10 s to finish a change; the Wi-Fi default of 8 s is too short. */
  static readonly WRITE_TIMEOUT_MS = 15_000;
  private schemaCache: SettingsSchema | null = null;

  constructor(private readonly transport: HttpTransport, private readonly pin: () => string | null) {}

  /** The schema is fetched once per connection and reused; pass `force` to refetch. */
  async schema(force = false): Promise<SettingsSchema> {
    if (this.schemaCache && !force) return this.schemaCache;
    const json = await this.getJson('/schema');
    this.schemaCache = parseSchema(json);
    return this.schemaCache;
  }

  /** GET helper shared by the schema and values reads. */
  private async getJson(path: string, params: string[] = []): Promise<any> {
    const query = params.length ? `?${params.join('&')}` : '';
    const response = await this.transport.execute(this.request('GET', `${SettingsApi.PREFIX}${path}${query}`));
    this.ensureSuccess(response);
    return JSON.parse(response.text());
  }

  async values(since?: { revision: number; epoch: number }): Promise<SettingsSnapshot> {
    const params = since && Number.isSafeInteger(since.revision) && Number.isSafeInteger(since.epoch)
      ? [`since=${since.revision}`, `epoch=${since.epoch}`]
      : [];
    return parseSnapshot(await this.getJson('', params));
  }

  async write(request: SettingsWriteRequest): Promise<SettingsWriteResult> {
    const body: Record<string, unknown> = { changes: request.changes };
    if (request.epoch != null && request.baseRevision != null) {
      body.epoch = request.epoch;
      body.baseRevision = request.baseRevision;
    }
    if (request.acknowledge?.length) body.acknowledge = request.acknowledge;
    const response = await this.transport.execute(this.request('POST', SettingsApi.PREFIX, body, SettingsApi.WRITE_TIMEOUT_MS));
    this.ensureSuccess(response);
    return parseWriteResult(JSON.parse(response.text()));
  }

  async runAction(id: string): Promise<void> {
    if (!/^[a-z0-9_.]+$/.test(id)) throw new Error('Invalid action id');
    const response = await this.transport.execute(this.request('POST', `${SettingsApi.PREFIX}/actions/${id}`));
    if (response.statusCode !== 202) throw mapSettingsError(response);
  }

  private request(method: 'GET' | 'POST', target: string, json?: unknown, timeoutMs?: number): HttpRequest {
    const headers: Record<string, string> = {};
    const pin = this.pin();
    if (pin) headers[SettingsApi.PIN_HEADER] = pin;
    let body: Uint8Array | undefined;
    if (json !== undefined) {
      body = new TextEncoder().encode(JSON.stringify(json));
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = String(body.length);
    } else if (method === 'POST') {
      body = new TextEncoder().encode('{}');
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = '2';
    }
    return { method, target, headers, body, ...(timeoutMs ? { timeoutMs } : {}) };
  }

  private ensureSuccess(response: HttpResponse): void {
    if (response.statusCode < 200 || response.statusCode >= 300) throw mapSettingsError(response);
  }
}
