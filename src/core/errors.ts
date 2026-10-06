/**
 * Custom exceptions for Compás Remote API interactions.
 */

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
      const parsed = JSON.parse(this.responseBody);
      return parsed.code === 'pin_required' || parsed.error === 'unauthorized';
    } catch {
      return false;
    }
  }

  get pinRateLimited(): boolean {
    if (this.statusCode !== 429) return false;
    try {
      const parsed = JSON.parse(this.responseBody);
      return parsed.code === 'pin_rate_limited';
    } catch {
      return false;
    }
  }

  get retryAfterSeconds(): number {
    try {
      const parsed = JSON.parse(this.responseBody);
      const seconds = Number(parsed.retryAfterSeconds);
      if (!isNaN(seconds) && seconds > 0) {
        return Math.min(Math.max(seconds, 1), 3600);
      }
    } catch {
      // fallback
    }
    return 60;
  }

  get isStaleRevision(): boolean {
    return this.statusCode === 409;
  }
}

export class ArtworkRequestPreemptedException extends Error {
  constructor(message: string = 'Artwork request was preempted') {
    super(message);
    this.name = 'ArtworkRequestPreemptedException';
  }
}
