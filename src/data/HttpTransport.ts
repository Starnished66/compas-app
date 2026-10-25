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
  bodyBase64?: string;
  text(): string;
  header(name: string): string | undefined;
}

export interface FileDownloadResult {
  status: number;
  headers: Record<string, string>;
  errorBody: string;
}

export type FileDownloader = (
  url: string,
  fileUri: string,
  headers: Record<string, string>,
  signal: AbortSignal
) => Promise<FileDownloadResult>;

export interface FileDownloadTransport extends HttpTransport {
  download(request: HttpRequest, fileUri: string): Promise<HttpResponse>;
}

export function isFileDownloadTransport(transport: HttpTransport): transport is FileDownloadTransport {
  return typeof (transport as Partial<FileDownloadTransport>).download === 'function';
}

function lowerCaseHeaders(forEachHeader: (visit: (value: string, name: string) => void) => void): Record<string, string> {
  const headers: Record<string, string> = {};
  forEachHeader((value, name) => {
    headers[name.toLowerCase()] = value;
  });
  return headers;
}

export function createHttpResponse(
  statusCode: number,
  reason: string,
  headers: Record<string, string>,
  body: Uint8Array
): HttpResponse {
  return {
    statusCode,
    reason,
    headers,
    body,
    text() {
      return new TextDecoder('utf-8').decode(body);
    },
    header(name: string) {
      return headers[name.toLowerCase()];
    },
  };
}

const CURRENT_ARTWORK_TARGET = '/api/v1/art';

export class ArtworkRequestPreemptedException extends Error {
  /** True when a foreground command cancelled the request; false when it only timed out. Preempted reads can be requeued. */
  readonly preempted: boolean;

  constructor(message: string = 'Artwork request was preempted', public cause?: unknown, preempted: boolean = true) {
    super(message);
    this.name = 'ArtworkRequestPreemptedException';
    this.preempted = preempted;
  }
}

export function isPreemptedArtworkError(error: unknown): boolean {
  return error instanceof ArtworkRequestPreemptedException && error.preempted;
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
  readonly download?: (request: HttpRequest, fileUri: string) => Promise<HttpResponse>;
  private nextOrder = 0;
  private running = false;
  private readonly pending: Array<{
    request: HttpRequest;
    order: number;
    run: () => Promise<HttpResponse>;
    resolve: (response: HttpResponse) => void;
    reject: (error: unknown) => void;
  }> = [];

  constructor(private readonly inner: HttpTransport) {
    if (isFileDownloadTransport(inner)) {
      this.download = (request, fileUri) => this.enqueue(request, () => inner.download(request, fileUri));
    }
  }

  execute(request: HttpRequest): Promise<HttpResponse> {
    return this.enqueue(request, () => this.inner.execute(request));
  }

  preemptArtworkRequest(index?: number): void {
    // A queued now-playing art read would run after the command and return the next track's art.
    if (index == null) this.dropQueuedCurrentArtwork();
    if (isArtworkPreemptibleTransport(this.inner)) this.inner.preemptArtworkRequest(index);
  }

  private dropQueuedCurrentArtwork(): void {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const queued = this.pending[i];
      if (queued.request.target !== CURRENT_ARTWORK_TARGET) continue;
      this.pending.splice(i, 1);
      queued.reject(new ArtworkRequestPreemptedException());
    }
  }

  private enqueue(request: HttpRequest, run: () => Promise<HttpResponse>): Promise<HttpResponse> {
    return new Promise<HttpResponse>((resolve, reject) => {
      this.pending.push({ request, order: this.nextOrder++, run, resolve, reject });
      this.pending.sort((left, right) => this.priority(left.request) - this.priority(right.request) || left.order - right.order);
      this.pump();
    });
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
    Promise.resolve().then(next.run).then(next.resolve, next.reject).finally(() => {
      this.running = false;
      this.pump();
    });
  }
}

function isCatalogArtworkRequest(target: string): boolean {
  return target === '/api/v1/catalog/art' || target.startsWith('/api/v1/catalog/art?');
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
  readonly download?: (request: HttpRequest, fileUri: string) => Promise<HttpResponse>;
  private baseUrl: string;
  private timeoutMs: number;
  private activeArtworkControllers = new Map<number | 'general', AbortController>();
  private preemptedControllers = new WeakSet<AbortController>();

  constructor(baseUrl: string, timeoutMs: number = 8000, downloadFile?: FileDownloader) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.timeoutMs = timeoutMs;
    if (downloadFile) {
      this.download = (request, fileUri) =>
        this.withAbortSignal(request, async (signal) => {
          const result = await downloadFile(this.urlFor(request), fileUri, request.headers ?? {}, signal);
          return createHttpResponse(
            result.status,
            '',
            lowerCaseHeaders((visit) => Object.entries(result.headers).forEach(([name, value]) => visit(value, name))),
            new TextEncoder().encode(result.errorBody)
          );
        });
    }
  }

  execute(request: HttpRequest): Promise<HttpResponse> {
    return this.withAbortSignal(request, async (signal) => {
      const res = await fetch(this.urlFor(request), {
        method: request.method,
        headers: request.headers,
        body: request.body ? new Blob([request.body as Uint8Array<ArrayBuffer>]) : undefined,
        signal,
      });
      const body = new Uint8Array(await res.arrayBuffer());
      return createHttpResponse(res.status, res.statusText || 'OK', lowerCaseHeaders((visit) => res.headers.forEach(visit)), body);
    });
  }

  preemptArtworkRequest(index?: number): void {
    if (index != null) {
      const controller = this.activeArtworkControllers.get(index);
      if (controller) {
        this.preemptedControllers.add(controller);
        controller.abort();
        this.activeArtworkControllers.delete(index);
      }
    } else {
      for (const controller of this.activeArtworkControllers.values()) {
        this.preemptedControllers.add(controller);
        controller.abort();
      }
      this.activeArtworkControllers.clear();
    }
  }

  private urlFor(request: HttpRequest): string {
    return `${this.baseUrl}${request.target}`;
  }

  private async withAbortSignal(
    request: HttpRequest,
    run: (signal: AbortSignal) => Promise<HttpResponse>
  ): Promise<HttpResponse> {
    const isArt = isOptionalArtworkRequest(request.target);
    const artIndex = isArt ? extractArtworkIndex(request.target) : null;
    const controller = new AbortController();
    // Catalog cover sync is not tied to the current track, so commands must not cancel it; it only times out.
    const preemptible = isArt && !isCatalogArtworkRequest(request.target);
    const key = !preemptible ? null : artIndex != null ? artIndex : 'general';

    if (key != null) {
      this.activeArtworkControllers.set(key, controller);
    }

    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await run(controller.signal);
    } catch (err: any) {
      if (controller.signal.aborted && isArt) {
        const preempted = this.preemptedControllers.has(controller);
        throw new ArtworkRequestPreemptedException(
          preempted ? 'Artwork request preempted' : 'Artwork request timed out',
          err,
          preempted
        );
      }
      throw err;
    } finally {
      clearTimeout(timer);
      if (key != null && this.activeArtworkControllers.get(key) === controller) {
        this.activeArtworkControllers.delete(key);
      }
    }
  }
}
