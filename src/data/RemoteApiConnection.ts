import type { ArtImage, Capabilities, PlaybackStatus } from './types';
import { SettingsApi } from './SettingsApi';
import { PluginsApi } from './PluginsApi';
import { isArtworkPreemptibleTransport, isFileDownloadTransport, type HttpTransport, type HttpRequest, type HttpResponse } from './HttpTransport';
import { bytesToBase64 } from './cryptoUtils';
import { parsePlaybackStatus } from './parsePlaybackStatus';
import {
  REMOTE_API_PREFIX, PIN_HEADER, CATALOG_PAGE_LIMIT, RemoteApiException, encodeRemoteParam,
  assertIntegerArgument, type RemoteApiRequests,
} from './remoteApiProtocol';

let commandsSent = 0;

export class RemoteApiConnection {
  static readonly PIN_HEADER = PIN_HEADER;
  static readonly CATALOG_SYNC_FEATURE = 'catalog_sync_v1';
  static readonly CATALOG_PAGE_LIMIT = CATALOG_PAGE_LIMIT;

  private transport: HttpTransport;
  private pin: string | null;
  protected prefix = REMOTE_API_PREFIX;
  private lastCatalogRevision: string | null = null;

  protected readonly requests: RemoteApiRequests = {
    jsonGet: (path, params, signal) => this.jsonGet(path, params, signal),
    send: (method, path, params, body) => this.send(method, path, params, body),
    command: (path, params) => this.command(path, params),
    ensureSuccess: (response) => this.ensureSuccess(response),
    readArt: (path, params) => this.readArt(path, params),
    downloadArtRequest: (fileUri, path, params) => this.downloadArtRequest(fileUri, path, params),
    getPin: () => this.pin,
    request: (method, path, params) => this.request(method, path, params),
    execute: (request) => this.transport.execute(request),
  };

  constructor(transport: HttpTransport, pin?: string | null) {
    if (pin != null && !/^[0-9]{4,12}$/.test(pin)) {
      throw new Error('PIN must contain 4 to 12 digits');
    }
    this.transport = transport;
    this.pin = pin || null;
  }

  setPin(pin: string | null): void {
    if (pin != null && !/^[0-9]{4,12}$/.test(pin)) {
      throw new Error('PIN must contain 4 to 12 digits');
    }
    this.pin = pin || null;
  }

  private settingsClient: SettingsApi | null = null;
  private pluginsClient: PluginsApi | null = null;

  /** Client for the player's remote settings; shares this connection's transport and follows PIN changes. */
  settings(): SettingsApi {
    return (this.settingsClient ??= new SettingsApi(this.transport, () => this.pin));
  }

  /** Client for plugin management; shares the connection transport and follows PIN changes. */
  plugins(): PluginsApi {
    return (this.pluginsClient ??= new PluginsApi(this.transport, () => this.pin));
  }

  preemptArtworkRequest(index?: number): void {
    if (index != null) assertIntegerArgument(index, 'Index', 0);
    if (isArtworkPreemptibleTransport(this.transport)) {
      this.transport.preemptArtworkRequest(index);
    }
  }

  async capabilities(options: { omitPin?: boolean } = {}): Promise<Capabilities> {
    let json: any;
    if (options.omitPin) {
      const response = await this.transport.execute(this.request('GET', `${this.prefix}/capabilities`, [], undefined, true));
      this.ensureSuccess(response);
      json = JSON.parse(response.text());
    } else {
      json = await this.jsonGet(`${this.prefix}/capabilities`);
    }
    return {
      version: json.version != null ? json.version : 1,
      transports: Array.isArray(json.transports) ? json.transports : [],
      features: Array.isArray(json.features) ? json.features : [],
      libraryId: typeof json.libraryId === 'string' && json.libraryId.trim() ? json.libraryId : null,
    };
  }

  async status(): Promise<PlaybackStatus> {
    const json = await this.jsonGet(`${this.prefix}/status`);
    const status = parsePlaybackStatus(json);
    this.lastCatalogRevision = typeof json.catalog_revision === 'string' && json.catalog_revision.trim()
      ? json.catalog_revision : null;
    return status;
  }

  async art(index?: number | null): Promise<ArtImage | null> {
    return this.readArt(`${this.prefix}/art`, this.artParams(index));
  }

  get commandGeneration(): number {
    return commandsSent;
  }

  get canDownloadArt(): boolean {
    return isFileDownloadTransport(this.transport);
  }

  get canDownloadLibraryArt(): boolean {
    return isFileDownloadTransport(this.transport) && this.transport.downloadRejectsRedirects === true;
  }

  get catalogRevision(): string | null {
    return this.lastCatalogRevision;
  }

  async downloadArt(fileUri: string, index?: number | null): Promise<boolean> {
    return this.downloadArtRequest(fileUri, `${this.prefix}/art`, this.artParams(index));
  }

  private artParams(index?: number | null): [string, string][] {
    if (index == null) return [];
    assertIntegerArgument(index, 'Index', 0);
    return [['index', index.toString()]];
  }

  private async downloadArtRequest(fileUri: string, path: string, params: [string, string][]): Promise<boolean> {
    if (!isFileDownloadTransport(this.transport)) throw new Error('Transport cannot download files');
    const response = await this.transport.download(this.request('GET', path, params), fileUri);
    if (response.statusCode === 404) return false;
    this.ensureSuccess(response);
    return true;
  }

  private async readArt(path: string, params: [string, string][]): Promise<ArtImage | null> {
    const response = await this.send('GET', path, params);
    if (response.statusCode === 404) return null;
    this.ensureSuccess(response);
    return {
      contentType: response.header('content-type'),
      base64: response.bodyBase64 ?? bytesToBase64(response.body),
    };
  }

  /** Matches java.net.URLEncoder used by the Android client for query parameters. */
  static encode(value: string): string {
    return encodeRemoteParam(value);
  }

  protected async command(path: string, params: [string, string][] = []): Promise<void> {
    this.ensureSuccess(await this.sendPlayerCommand(path, params));
  }

  protected sendPlayerCommand(path: string, params: [string, string][]): Promise<HttpResponse> {
    // Release the socket from optional artwork reads before sending a player command.
    this.preemptArtworkRequest();
    commandsSent++;
    return this.send('POST', `${this.prefix}${path}`, params);
  }

  protected async jsonGet(path: string, params: [string, string][] = [], signal?: AbortSignal): Promise<any> {
    const request = this.request('GET', path, params);
    const res = await this.transport.execute(signal ? { ...request, queueSignal: signal } : request);
    this.ensureSuccess(res);
    return JSON.parse(res.text());
  }

  private async send(method: 'GET' | 'POST', path: string, params: [string, string][] = [], body?: Uint8Array): Promise<HttpResponse> {
    return this.transport.execute(this.request(method, path, params, body));
  }

  private request(method: 'GET' | 'POST', path: string, params: [string, string][] = [], body?: Uint8Array, omitPin = false): HttpRequest {
    if (!path.startsWith('/') || path.includes('?')) {
      throw new Error('Invalid path format');
    }
    const query = params.map(([k, v]) => `${RemoteApiConnection.encode(k)}=${RemoteApiConnection.encode(v)}`).join('&');
    const target = `${path}${query ? `?${query}` : ''}`;
    const headers: Record<string, string> = {};
    if (this.pin && !omitPin) {
      headers[RemoteApiConnection.PIN_HEADER] = this.pin;
    }
    if (body) {
      headers['Content-Type'] = 'audio/x-mpegurl';
      headers['Content-Length'] = String(body.length);
    }
    return { method, target, headers, body };
  }

  private ensureSuccess(response: HttpResponse): void {
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new RemoteApiException(response.statusCode, response.text());
    }
  }
}
