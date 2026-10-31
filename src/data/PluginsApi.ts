import type { HttpRequest, HttpResponse, HttpTransport } from './HttpTransport';
import type { ActionResult, InstalledSnapshot, LayoutSnapshot, StoreSnapshot } from '../core/pluginModels';
import {
  PluginResponseError, parseInstalledSnapshot, parseLayoutSnapshot, parseStoreSnapshot,
} from '../core/pluginModels';

const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_PAGE_SIZE = 200;
const MAX_ID_BYTES = 255;
const MAX_OFFSET = 2_147_483_647;
const WRITE_TIMEOUT_MS = 15_000;
const MAX_PREVIEW_BYTES = 512 * 1024;
const MAX_PREVIEW_BASE64 = 4 * Math.ceil(MAX_PREVIEW_BYTES / 3);

export type PluginPreviewResult = { state: 'ready'; mime: 'image/png' | 'image/jpeg'; data: string } | { state: 'pending' | 'busy' | 'unavailable' };

export class PluginsApiError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(`Player plugins request failed: HTTP ${status} ${code}`);
    this.name = 'PluginsApiError';
  }
}

function parseJson(response: HttpResponse): any {
  if (response.body.byteLength > MAX_RESPONSE_BYTES) throw new PluginResponseError('Plugin response exceeds the size limit');
  try {
    return JSON.parse(response.text());
  } catch {
    throw new PluginResponseError('Invalid plugin JSON response');
  }
}

function errorCode(response: HttpResponse): string {
  if (response.body.byteLength > MAX_RESPONSE_BYTES) return 'invalid_response';
  try {
    const body = JSON.parse(response.text());
    if (body && typeof body.code === 'string' && /^[a-z0-9_]{1,64}$/.test(body.code)) return body.code;
    if (body && typeof body.error === 'string' && /^[a-z0-9_]{1,64}$/.test(body.error)) return body.error;
  } catch {
    // Never include arbitrary response text in an exception (it could echo credentials).
  }
  return 'unknown';
}

function pagination(offset: number, limit: number): string {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > MAX_OFFSET) throw new Error(`Offset must be an integer between 0 and ${MAX_OFFSET}`);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) throw new Error(`Limit must be between 1 and ${MAX_PAGE_SIZE}`);
  return `?offset=${offset}&limit=${limit}`;
}

function identifier(value: string, label = 'ID'): string {
  if (typeof value !== 'string' || value.length < 1 || new TextEncoder().encode(value).byteLength > MAX_ID_BYTES || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

function storeId(value: string): string {
  identifier(value, 'store ID');
  if (value.length > 63 || !/^[a-z0-9][a-z0-9_.-]*$/.test(value)) throw new Error('Invalid store ID');
  return value;
}

function pluginFilename(value: string): string {
  identifier(value, 'plugin filename');
  if (value.length < 5 || !/\.lua$/i.test(value) || /[\\/]/.test(value)) throw new Error('Invalid plugin filename');
  return value;
}

function layoutId(value: string): string {
  identifier(value, 'layout ID');
  if (new TextEncoder().encode(value).byteLength > 63 || !/^[a-zA-Z0-9_.-]+$/.test(value)) throw new Error('Invalid layout ID');
  return value;
}

function parseAction(value: unknown, storeSnapshot = false): ActionResult {
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof (value as any).accepted !== 'boolean') {
    throw new PluginResponseError('Invalid plugin action response');
  }
  const raw = value as Record<string, any>;
  const result: ActionResult = { accepted: raw.accepted };
  if (raw.refresh_requested !== undefined) {
    if (typeof raw.refresh_requested !== 'boolean') throw new PluginResponseError('Invalid plugin action response field');
    result.refresh_requested = raw.refresh_requested;
  }
  if (raw.current !== undefined) {
    result.current = typeof raw.current === 'string'
      ? raw.current
      : storeSnapshot ? parseStoreSnapshot(raw.current) : (() => { throw new PluginResponseError('Invalid plugin action response field'); })();
  }
  if (storeSnapshot) {
    // Store action responses carry the accepted/current store snapshot at the top level.
    if (raw.state !== undefined) Object.assign(result, parseStoreSnapshot(raw));
    else if (raw.current && typeof raw.current === 'object') Object.assign(result, parseStoreSnapshot(raw.current));
  }
  return result;
}

/** Client for the player's remote plugin store, installed plugins, and layouts. */
export class PluginsApi {
  private static readonly PREFIX = '/api/v1';
  private static readonly PIN_HEADER = 'X-Compas-PIN';

  constructor(private readonly transport: HttpTransport, private readonly pin: () => string | null) {}

  async store(offset = 0, limit = 50): Promise<StoreSnapshot> {
    const response = await this.transport.execute(this.request('GET', `${PluginsApi.PREFIX}/plugin-store${pagination(offset, limit)}`));
    this.ensureSuccess(response);
    return parseStoreSnapshot(parseJson(response), offset, limit);
  }

  async storePreview(id: string): Promise<PluginPreviewResult> {
    return this.preview(`/plugin-store/preview?id=${encodeURIComponent(storeId(id))}`);
  }

  async refreshStore(): Promise<ActionResult> {
    return this.post('/plugin-store/refresh', {}, true);
  }

  async install(id: string, force = false): Promise<ActionResult> {
    return this.post('/plugin-store/install', { id: storeId(id), force: this.boolean(force, 'force') }, true);
  }

  async update(id: string, force = false): Promise<ActionResult> {
    return this.post('/plugin-store/update', { id: storeId(id), force: this.boolean(force, 'force') }, true);
  }

  async updateAll(): Promise<ActionResult> {
    return this.post('/plugin-store/update-all', {}, true);
  }

  async uninstall(id: string): Promise<ActionResult> {
    return this.post('/plugin-store/uninstall', { id: storeId(id) }, true);
  }

  async installed(offset = 0, limit = 50): Promise<InstalledSnapshot> {
    const response = await this.transport.execute(this.request('GET', `${PluginsApi.PREFIX}/plugins${pagination(offset, limit)}`));
    this.ensureSuccess(response);
    return parseInstalledSnapshot(parseJson(response), offset, limit);
  }

  async setEnabled(filename: string, enabled: boolean): Promise<ActionResult> {
    return this.post('/plugins/set-enabled', { id: pluginFilename(filename), enabled: this.boolean(enabled, 'enabled') });
  }

  async openSettings(filename: string): Promise<ActionResult> {
    return this.post('/plugins/open-settings', { id: pluginFilename(filename) });
  }

  async refreshPlugins(): Promise<ActionResult> {
    return this.post('/plugins/refresh', {});
  }

  async layouts(offset = 0, limit = 50): Promise<LayoutSnapshot> {
    const response = await this.transport.execute(this.request('GET', `${PluginsApi.PREFIX}/player-layouts${pagination(offset, limit)}`));
    this.ensureSuccess(response);
    return parseLayoutSnapshot(parseJson(response), offset, limit);
  }

  async layoutPreview(id: string): Promise<PluginPreviewResult> {
    return this.preview(`/player-layouts/preview?id=${encodeURIComponent(layoutId(id))}`);
  }

  async selectLayout(id: string): Promise<ActionResult> {
    return this.post('/player-layouts/select', { id: layoutId(id) });
  }

  private async preview(path: string): Promise<PluginPreviewResult> {
    const response = await this.transport.execute(this.request('GET', `${PluginsApi.PREFIX}${path}`));
    if (response.statusCode === 404) return { state: 'unavailable' };
    if (response.statusCode === 409) return { state: 'busy' };
    if (response.statusCode === 202) {
      const value = parseJson(response);
      if (!value || typeof value !== 'object' || value.pending !== true) throw new PluginResponseError('Invalid preview pending response');
      return { state: 'pending' };
    }
    if (response.statusCode !== 200) throw new PluginsApiError(response.statusCode, errorCode(response));
    const value = parseJson(response);
    const data = value && typeof value === 'object' && !Array.isArray(value) && typeof value.data === 'string' ? value.data : '';
    const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
    const decodedBytes = data.length / 4 * 3 - padding;
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        (value.mime !== 'image/png' && value.mime !== 'image/jpeg') || typeof value.data !== 'string' ||
        data.length < 1 || data.length > MAX_PREVIEW_BASE64 || data.length % 4 !== 0 || decodedBytes > MAX_PREVIEW_BYTES ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data)) {
      throw new PluginResponseError('Invalid plugin preview response');
    }
    return { state: 'ready', mime: value.mime, data };
  }

  private boolean(value: boolean, field: string): boolean {
    if (typeof value !== 'boolean') throw new Error(`${field} must be a boolean`);
    return value;
  }

  private async post(path: string, body: Record<string, unknown>, storeSnapshot = false): Promise<ActionResult> {
    const response = await this.transport.execute(this.request('POST', `${PluginsApi.PREFIX}${path}`, body));
    if (response.statusCode !== 202) throw new PluginsApiError(response.statusCode, errorCode(response));
    return parseAction(parseJson(response), storeSnapshot);
  }

  private request(method: 'GET' | 'POST', target: string, json?: unknown): HttpRequest {
    const headers: Record<string, string> = {};
    const pin = this.pin();
    // The player requires this header for mutations; never rely on browser cookies or ambient auth.
    if (pin) headers[PluginsApi.PIN_HEADER] = pin;
    let body: Uint8Array | undefined;
    if (json !== undefined) {
      body = new TextEncoder().encode(JSON.stringify(json));
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = String(body.byteLength);
    } else if (method === 'POST') {
      body = new TextEncoder().encode('{}');
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = '2';
    }
    return { method, target, headers, body, ...(method === 'POST' ? { timeoutMs: WRITE_TIMEOUT_MS } : {}) } satisfies HttpRequest;
  }

  private ensureSuccess(response: HttpResponse): void {
    if (response.statusCode < 200 || response.statusCode >= 300) throw new PluginsApiError(response.statusCode, errorCode(response));
  }
}
