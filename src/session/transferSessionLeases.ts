import type { WifiImportStatus } from '../data/types';

export interface AcquireTransferLeaseOptions {
  /**
   * Read-only leases (screenshot, playlist export) never stop the player's import session on release.
   * Stopping the import session always triggers a full library rescan on the player.
   */
  readOnly?: boolean;
}

export interface TransferSessionLease {
  readonly id: number;
  /** True while this lease is unreleased, not aborted, and still on the same player connection. */
  isActive(): boolean;
  /** Releases this lease; stops the player transfer service only when allowed and no other active leases remain. */
  release(options?: { stopIfIdle?: boolean }): Promise<void>;
}

export interface TransferSessionLeasesDeps {
  getSessionToken: () => object | null;
  getState: () => WifiImportStatus['state'];
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

function abortError(): Error {
  return new Error('Transfer cancelled.');
}

function awaitWithAbort(promise: Promise<void>, signal?: AbortSignal): Promise<void> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      () => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      },
      (err) => {
        signal.removeEventListener('abort', onAbort);
        reject(err);
      },
    );
  });
}

/**
 * Shared ownership/lease coordinator for the player's Wi-Fi transfer service.
 * Ensures concurrent or obsolete operations cannot stop a newer operation's session,
 * and disconnects or player switches invalidate all prior leases.
 */
export class TransferSessionLeases {
  private sessionToken: object | null = null;
  private epoch = 0;
  private nextLeaseId = 0;
  private activeLeases = new Set<number>();
  private startedByWritableLease = false;
  private pendingOp: { epoch: number; kind: 'start' | 'stop'; promise: Promise<void> } | null = null;

  constructor(private readonly deps: TransferSessionLeasesDeps) {}

  private syncSession(): object | null {
    const token = this.deps.getSessionToken();
    if (token !== this.sessionToken) {
      this.sessionToken = token;
      this.invalidate();
    }
    return token;
  }

  invalidate(): void {
    this.epoch++;
    this.activeLeases.clear();
    this.startedByWritableLease = false;
    this.pendingOp = null;
  }

  async acquire(signal?: AbortSignal, options?: AcquireTransferLeaseOptions): Promise<TransferSessionLease> {
    if (signal?.aborted) throw abortError();
    const token = this.syncSession();
    if (!token) throw new Error('Connect to the player over Wi-Fi to start file import.');

    const leaseEpoch = this.epoch;
    const id = ++this.nextLeaseId;
    const readOnly = Boolean(options?.readOnly);
    this.activeLeases.add(id);

    const lease = this.createLease(token, leaseEpoch, id, readOnly, signal);
    try {
      await this.ensureStarted(token, leaseEpoch, readOnly, lease.isActive, signal);
    } catch (err) {
      void lease.release().catch(() => {});
      throw err;
    }

    if (!lease.isActive()) {
      void lease.release().catch(() => {});
      throw abortError();
    }

    return lease;
  }

  private createLease(
    token: object,
    leaseEpoch: number,
    id: number,
    readOnly: boolean,
    signal?: AbortSignal,
  ): TransferSessionLease {
    let released = false;
    const isActive = () =>
      !released &&
      !signal?.aborted &&
      this.syncSession() === token &&
      this.epoch === leaseEpoch &&
      this.activeLeases.has(id);

    const release = async (options?: { stopIfIdle?: boolean }): Promise<void> => {
      if (released) return;
      released = true;
      await this.releaseLease(token, leaseEpoch, id, readOnly, options);
    };

    return { id, isActive, release };
  }

  private async releaseLease(
    token: object,
    leaseEpoch: number,
    id: number,
    readOnly: boolean,
    options?: { stopIfIdle?: boolean },
  ): Promise<void> {
    if (this.syncSession() !== token || this.epoch !== leaseEpoch) return;
    this.activeLeases.delete(id);
    if (this.activeLeases.size > 0) return;

    // Read-only leases never stop the player's import service on release.
    if (readOnly && !options?.stopIfIdle) return;

    while (this.pendingOp && this.pendingOp.epoch === leaseEpoch) {
      const pending = this.pendingOp;
      try {
        await pending.promise;
      } catch {
        // A failed start or stop leaves state to be re-evaluated below.
      }
      if (this.syncSession() !== token || this.epoch !== leaseEpoch || this.activeLeases.size > 0) return;
      if (pending.kind === 'stop') return;
    }

    if (!options?.stopIfIdle && !this.startedByWritableLease) return;
    this.startedByWritableLease = false;
    const stopPromise = this.deps.stop().finally(() => {
      if (this.pendingOp?.promise === stopPromise) {
        this.pendingOp = null;
      }
    });
    this.pendingOp = { epoch: leaseEpoch, kind: 'stop', promise: stopPromise };
    await stopPromise;
  }

  private async ensureStarted(
    token: object,
    leaseEpoch: number,
    readOnly: boolean,
    isActive: () => boolean,
    signal?: AbortSignal,
  ): Promise<void> {
    while (true) {
      if (!isActive()) throw abortError();

      const pending = this.pendingOp;
      if (pending && pending.epoch === leaseEpoch) {
        if (pending.kind === 'stop') {
          await awaitWithAbort(pending.promise.catch(() => {}), signal);
          continue;
        }
        await awaitWithAbort(pending.promise, signal);
        if (!isActive()) throw abortError();
        if (this.pendingOp && this.pendingOp.epoch === leaseEpoch) continue;
        return;
      }

      if (this.deps.getState() === 'ready') return;

      const startPromise = this.deps.start().then(() => {
        if (!readOnly && this.syncSession() === token && this.epoch === leaseEpoch) {
          this.startedByWritableLease = true;
        }
      }).finally(() => {
        if (this.pendingOp?.promise === startPromise) {
          this.pendingOp = null;
        }
      });
      this.pendingOp = { epoch: leaseEpoch, kind: 'start', promise: startPromise };
      await awaitWithAbort(startPromise, signal);
      if (!isActive()) throw abortError();
      if (this.pendingOp && this.pendingOp.epoch === leaseEpoch) continue;
      return;
    }
  }
}
