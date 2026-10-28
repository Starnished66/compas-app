const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** The player never redirects, so a redirect means the request must not carry the PIN any further. */
export class PinRedirectError extends Error {
  constructor() {
    super('The player redirected the request, so the PIN was not sent there.');
    this.name = 'PinRedirectError';
  }
}

export function refuseRedirect(status: number): void {
  if (REDIRECT_STATUSES.has(status)) throw new PinRedirectError();
}
