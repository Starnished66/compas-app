/**
 * Transports for Compás Remote HTTP communication over Wi-Fi and Bluetooth RFCOMM.
 */

import { ArtworkRequestPreemptedException } from './errors';

export interface HttpRequest {
  method: 'GET' | 'POST';
  target: string; // Origin-form path & query, e.g. "/api/v1/status"
  headers?: Record<string, string>;
}

export class HttpResponse {
  readonly statusCode: number;
  readonly reason: string;
  readonly headers: Record<string, string>;
  readonly body: Uint8Array;

  constructor(
    statusCode: number,
    reason: string,
    headers: Record<string, string>,
    body: Uint8Array
  ) {
    this.statusCode = statusCode;
    this.reason = reason;
    this.headers = headers;
    this.body = body;
  }

  header(name: string): string | undefined {
    return this.headers[name.toLowerCase()];
  }

  text(): string {
    return new TextDecoder('utf-8').decode(this.body);
  }
}

export interface HttpTransport {
  execute(request: HttpRequest): Promise<HttpResponse>;
}

export interface ArtworkPreemptibleTransport {
  preemptArtworkRequest(index?: number): void;
}

export function isOptionalArtworkRequest(target: string): boolean {
  return (
    target === '/api/v1/art' ||
    target.startsWith('/api/v1/art?') ||
    target === '/api/v1/catalog/art' ||
    target.startsWith('/api/v1/catalog/art?')
  );
}

export function extractArtworkIndex(target: string): number | null {
  const qIndex = target.indexOf('?');
  if (qIndex === -1) return null;
  const queryString = target.slice(qIndex + 1);
  const params = queryString.split('&');
  for (const p of params) {
    if (p.startsWith('index=')) {
      const val = parseInt(p.slice('index='.length), 10);
      return isNaN(val) ? null : val;
    }
  }
  return null;
}

/**
 * Gate that tracks active optional artwork exchanges so foreground player commands
 * can preempt them and yield link / socket bandwidth.
 */
export class ArtworkRequestGate<T> {
  private activeExchanges = new Set<{ index: number | null; handle: T; preempted: boolean }>();
  private readonly abortHandle: (handle: T) => void;

  constructor(abortHandle: (handle: T) => void) {
    this.abortHandle = abortHandle;
  }

  begin(index: number | null, handle: T) {
    const exchange = { index, handle, preempted: false };
    this.activeExchanges.add(exchange);
    return exchange;
  }

  end(exchange: { index: number | null; handle: T; preempted: boolean }) {
    this.activeExchanges.delete(exchange);
  }

  preempt(index?: number): boolean {
    let preemptedAny = false;
    for (const exchange of Array.from(this.activeExchanges)) {
      if (index === undefined || exchange.index === index) {
        exchange.preempted = true;
        this.abortHandle(exchange.handle);
        this.activeExchanges.delete(exchange);
        preemptedAny = true;
      }
    }
    return preemptedAny;
  }
}

/**
 * Stream HTTP response parser according to RFC 9112 and Compás RFCOMM framing.
 * Parses headers until \r\n\r\n and reads exactly Content-Length bytes.
 */
export class StreamHttpParser {
  static readonly DEFAULT_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
  private static readonly MAX_HEADER_BYTES = 32 * 1024;

  static parseResponse(
    bytes: Uint8Array,
    maxBodyBytes: number = StreamHttpParser.DEFAULT_MAX_RESPONSE_BYTES
  ): HttpResponse {
    // Look for \r\n\r\n (13, 10, 13, 10)
    let headerEnd = -1;
    for (let i = 0; i < bytes.length - 3; i++) {
      if (
        bytes[i] === 13 &&
        bytes[i + 1] === 10 &&
        bytes[i + 2] === 13 &&
        bytes[i + 3] === 10
      ) {
        headerEnd = i;
        break;
      }
    }

    if (headerEnd === -1) {
      if (bytes.length > StreamHttpParser.MAX_HEADER_BYTES) {
        throw new Error('HTTP headers too large');
      }
      throw new Error('Truncated HTTP headers');
    }

    const headerBytes = bytes.slice(0, headerEnd);
    const headerText = new TextDecoder('iso-8859-1').decode(headerBytes);
    const lines = headerText.split('\r\n');
    if (lines.length === 0 || !lines[0]) {
      throw new Error('Invalid HTTP status line');
    }

    const statusMatch = /^HTTP\/1\.[01] ([0-9]{3})(?: (.*))?$/.exec(lines[0]);
    if (!statusMatch || !statusMatch[1]) {
      throw new Error('Invalid HTTP status line: ' + lines[0]);
    }

    const statusCode = parseInt(statusMatch[1], 10);
    const reason = statusMatch[2] || '';

    const headers: Record<string, string> = {};
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const colon = line.indexOf(':');
      if (colon <= 0) {
        throw new Error('Invalid HTTP header: ' + line);
      }
      const key = line.slice(0, colon).trim().toLowerCase();
      const value = line.slice(colon + 1).trim();
      headers[key] = headers[key] ? `${headers[key]}, ${value}` : value;
    }

    if (headers['transfer-encoding']) {
      throw new Error('Transfer-Encoding is unsupported');
    }

    const lengthStr = headers['content-length'];
    if (!lengthStr || !/^\d+$/.test(lengthStr)) {
      throw new Error('Missing or invalid Content-Length');
    }

    const contentLength = parseInt(lengthStr, 10);
    if (contentLength < 0 || contentLength > maxBodyBytes) {
      throw new Error('HTTP body exceeds limit');
    }

    const bodyStart = headerEnd + 4;
    const bodyBytes = bytes.slice(bodyStart);
    if (bodyBytes.length < contentLength) {
      throw new Error(
        `Truncated HTTP body: expected ${contentLength} bytes, got ${bodyBytes.length}`
      );
    }

    return new HttpResponse(
      statusCode,
      reason,
      headers,
      bodyBytes.slice(0, contentLength)
    );
  }
}

/**
 * Standard Wi-Fi transport using Fetch API with abortable artwork requests.
 */
export class WifiHttpTransport implements HttpTransport, ArtworkPreemptibleTransport {
  readonly baseUrl: string;
  readonly connectTimeoutMs: number;
  readonly readTimeoutMs: number;
  private artworkGate: ArtworkRequestGate<AbortController>;

  constructor(
    baseUrl: string,
    connectTimeoutMs: number = 3000,
    readTimeoutMs: number = 5000
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.connectTimeoutMs = connectTimeoutMs;
    this.readTimeoutMs = readTimeoutMs;
    this.artworkGate = new ArtworkRequestGate<AbortController>((controller) => {
      controller.abort();
    });
  }

  preemptArtworkRequest(index?: number): void {
    this.artworkGate.preempt(index);
  }

  async execute(request: HttpRequest): Promise<HttpResponse> {
    const isArtwork = isOptionalArtworkRequest(request.target);
    const controller = new AbortController();
    const exchange = isArtwork
      ? this.artworkGate.begin(extractArtworkIndex(request.target), controller)
      : null;

    const timeout = setTimeout(() => {
      controller.abort();
    }, isArtwork ? 20000 : this.readTimeoutMs);

    const fullUrl = `${this.baseUrl}${request.target}`;
    try {
      const fetchHeaders: Record<string, string> = {
        Connection: 'close',
        ...(request.headers || {}),
      };

      const response = await fetch(fullUrl, {
        method: request.method,
        headers: fetchHeaders,
        signal: controller.signal,
      });

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key.toLowerCase()] = value;
      });

      const arrayBuffer = await response.arrayBuffer();
      const bodyBytes = new Uint8Array(arrayBuffer);

      return new HttpResponse(
        response.status,
        response.statusText,
        responseHeaders,
        bodyBytes
      );
    } catch (err: any) {
      if (exchange?.preempted) {
        throw new ArtworkRequestPreemptedException('Artwork request preempted by foreground command');
      }
      if (err.name === 'AbortError') {
        throw new Error(`Request timed out or was aborted: ${request.target}`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
      if (exchange) {
        this.artworkGate.end(exchange);
      }
    }
  }
}
