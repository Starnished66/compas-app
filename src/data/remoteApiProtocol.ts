import type { HttpRequest, HttpResponse } from './HttpTransport';

export const REMOTE_API_PREFIX = '/api/v1';
export const PIN_HEADER = 'X-Compas-PIN';
export const CATALOG_PAGE_LIMIT = 100;

type QueryParams = [string, string][];

export interface RemoteApiRequests {
  jsonGet(path: string, params?: QueryParams, signal?: AbortSignal): Promise<any>;
  send(method: 'GET' | 'POST', path: string, params?: QueryParams, body?: Uint8Array): Promise<HttpResponse>;
  command(path: string, params?: QueryParams): Promise<void>;
  ensureSuccess(response: HttpResponse): void;
  readArt(path: string, params: QueryParams): Promise<import('./types').ArtImage | null>;
  downloadArtRequest(fileUri: string, path: string, params: QueryParams): Promise<boolean>;
  getPin(): string | null;
  request(method: 'GET' | 'POST', path: string, params: QueryParams): HttpRequest;
  execute(request: HttpRequest): Promise<HttpResponse>;
}

export class RemoteApiException extends Error {
  readonly statusCode: number;
  readonly responseBody: string;

  constructor(statusCode: number, responseBody: string) {
    super(`Remote API returned HTTP ${statusCode}${responseBody.trim() ? `: ${responseBody}` : ''}`);
    this.name = 'RemoteApiException';
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }

  get pinRequired(): boolean {
    if (this.statusCode !== 401) return false;
    try {
      const json = JSON.parse(this.responseBody);
      return json.code === 'pin_required';
    } catch {
      return false;
    }
  }

  get pinRateLimited(): boolean {
    if (this.statusCode !== 429) return false;
    try {
      const json = JSON.parse(this.responseBody);
      return json.code === 'pin_rate_limited';
    } catch {
      return false;
    }
  }

  get retryAfterSeconds(): number {
    try {
      const json = JSON.parse(this.responseBody);
      const val = parseInt(json.retryAfterSeconds, 10);
      if (!isNaN(val)) {
        return Math.max(1, Math.min(val, 3600));
      }
    } catch {
      // ignore
    }
    return 60;
  }
}

export function jsonBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return false;
}

export function nullableJsonBoolean(value: unknown, field: string): boolean | null {
  if (value == null) return null;
  if (typeof value !== 'boolean') throw new Error(`Field '${field}' is invalid`);
  return value;
}

export function requiredInteger(value: unknown, field: string, min: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min) {
    throw new Error(`Field '${field}' is missing or invalid`);
  }
  return value;
}

export function nullablePositiveInteger(value: unknown, field: string): number | null {
  if (value == null) return null;
  return requiredInteger(value, field, 1);
}

export function assertIntegerArgument(value: number, field: string, min: number, max: number = Number.MAX_SAFE_INTEGER): void {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${field} must be an integer between ${min} and ${max}`);
  }
}

export function parseRating(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 5 ? value : null;
}

export function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`Field '${field}' is missing or invalid`);
  return value;
}

export function nullableString(value: unknown, field: string): string | null {
  if (value == null) return null;
  const result = requiredString(value, field);
  return result.trim() ? result : null;
}

export function encodeRemoteParam(value: string): string {
  return encodeURIComponent(value)
    .replace(/[!'()~]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%20/g, '+');
}
