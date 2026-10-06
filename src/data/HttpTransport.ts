export interface HttpRequest {
  method: 'GET' | 'POST';
  target: string;
  headers?: Record<string, string>;
  body?: Uint8Array;
}

export interface HttpResponse {
  statusCode: number;
  reason: string;
  headers: Record<string, string>;
  body: Uint8Array;
  text(): string;
  header(name: string): string | undefined;
}

export class ArtworkRequestPreemptedException extends Error {
  constructor(message: string = 'Artwork request was preempted', public cause?: unknown) {
    super(message);
    this.name = 'ArtworkRequestPreemptedException';
  }
}

export interface ArtworkPreemptibleTransport {
  preemptArtworkRequest(index?: number): void;
}

export interface HttpTransport {
  execute(request: HttpRequest): Promise<HttpResponse>;
}

export function isArtworkPreemptibleTransport(transport: unknown): transport is ArtworkPreemptibleTransport {
  return (
    typeof transport === 'object' &&
    transport !== null &&
    'preemptArtworkRequest' in transport &&
    typeof (transport as ArtworkPreemptibleTransport).preemptArtworkRequest === 'function'
  );
}

/** Serializes one-request-per-socket player traffic like the native session's network dispatcher. */
export class SerializedHttpTransport implements HttpTransport, ArtworkPreemptibleTransport {
  private nextOrder = 0;
  private running = false;
  private readonly pending: Array<{
    request: HttpRequest;
    order: number;
    resolve: (response: HttpResponse) => void;
    reject: (error: unknown) => void;
  }> = [];

  constructor(private readonly inner: HttpTransport) {}

  execute(request: HttpRequest): Promise<HttpResponse> {
    return new Promise<HttpResponse>((resolve, reject) => {
      this.pending.push({ request, order: this.nextOrder++, resolve, reject });
      this.pending.sort((left, right) => this.priority(left.request) - this.priority(right.request) || left.order - right.order);
      this.pump();
    });
  }

  preemptArtworkRequest(index?: number): void {
    if (isArtworkPreemptibleTransport(this.inner)) this.inner.preemptArtworkRequest(index);
  }

  private priority(request: HttpRequest): number {
    if (request.method === 'POST') return 0;
    return isOptionalArtworkRequest(request.target) ? 2 : 1;
  }

  private pump(): void {
    if (this.running) return;
    const next = this.pending.shift();
    if (!next) return;
    this.running = true;
    Promise.resolve().then(() => this.inner.execute(next.request)).then(next.resolve, next.reject).finally(() => {
      this.running = false;
      this.pump();
    });
  }
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
  const query = target.includes('?') ? target.split('?')[1] : '';
  const match = query.split('&').find((p) => p.startsWith('index='));
  if (match) {
    const val = parseInt(match.substring('index='.length), 10);
    return isNaN(val) ? null : val;
  }
  return null;
}

export class FetchHttpTransport implements HttpTransport, ArtworkPreemptibleTransport {
  private baseUrl: string;
  private timeoutMs: number;
  private activeArtworkControllers = new Map<number | 'general', AbortController>();

  constructor(baseUrl: string, timeoutMs: number = 8000) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.timeoutMs = timeoutMs;
  }

  async execute(request: HttpRequest): Promise<HttpResponse> {
    const isArt = isOptionalArtworkRequest(request.target);
    const artIndex = isArt ? extractArtworkIndex(request.target) : null;
    const controller = new AbortController();
    const key = artIndex != null ? artIndex : (isArt ? 'general' : null);

    if (key != null) {
      this.activeArtworkControllers.set(key, controller);
    }

    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const url = `${this.baseUrl}${request.target}`;
      const res = await fetch(url, {
        method: request.method,
        headers: request.headers,
        body: request.body ? new Blob([request.body as Uint8Array<ArrayBuffer>]) : undefined,
        signal: controller.signal,
      });

      const buffer = await res.arrayBuffer();
      const body = new Uint8Array(buffer);
      const resHeaders: Record<string, string> = {};
      res.headers.forEach((val, name) => {
        resHeaders[name.toLowerCase()] = val;
      });

      return {
        statusCode: res.status,
        reason: res.statusText || 'OK',
        headers: resHeaders,
        body,
        text() {
          return new TextDecoder('utf-8').decode(body);
        },
        header(name: string) {
          return resHeaders[name.toLowerCase()];
        },
      };
    } catch (err: any) {
      if (controller.signal.aborted && isArt) {
        throw new ArtworkRequestPreemptedException('Artwork request preempted or timed out', err);
      }
      throw err;
    } finally {
      clearTimeout(timer);
      if (key != null) {
        this.activeArtworkControllers.delete(key);
      }
    }
  }

  preemptArtworkRequest(index?: number): void {
    if (index != null) {
      const controller = this.activeArtworkControllers.get(index);
      if (controller) {
        controller.abort();
        this.activeArtworkControllers.delete(index);
      }
    } else {
      // Abort all active artwork controllers
      for (const [key, controller] of this.activeArtworkControllers.entries()) {
        controller.abort();
      }
      this.activeArtworkControllers.clear();
    }
  }
}
