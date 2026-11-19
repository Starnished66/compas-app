type Poll = (ownsLoop: () => boolean) => Promise<number | undefined>;

interface PollGeneration {
  timer?: ReturnType<typeof setTimeout>;
  inFlight: boolean;
  pending?: { poll: Poll; dueAt: number };
}

export class StatusPollLoop {
  private generation: PollGeneration = { inFlight: false };
  private idleWaiters: Array<() => void> = [];

  /** Resolves once no status read is in flight, so a queued read cannot run before its route is applied. */
  whenIdle(): Promise<void> {
    if (!this.generation.inFlight) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  private wakeIdleWaiters(): void {
    if (this.generation.inFlight) return;
    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    waiters.forEach((resolve) => resolve());
  }

  request(poll: Poll, delayMs: number): void {
    const generation = this.generation;
    if (generation.inFlight) {
      const dueAt = Date.now() + delayMs;
      generation.pending = { poll, dueAt: Math.min(dueAt, generation.pending?.dueAt ?? dueAt) };
      return;
    }
    clearTimeout(generation.timer);
    generation.timer = undefined;
    if (delayMs === 0) {
      void this.run(generation, poll);
    } else {
      generation.timer = setTimeout(() => {
        generation.timer = undefined;
        void this.run(generation, poll);
      }, delayMs);
    }
  }

  stop(): void {
    clearTimeout(this.generation.timer);
    this.generation = { inFlight: false };
    this.wakeIdleWaiters();
  }

  private async run(generation: PollGeneration, poll: Poll): Promise<void> {
    const ownsLoop = () => generation === this.generation;
    generation.inFlight = true;
    let nextDelay: number | undefined;
    try {
      nextDelay = await poll(ownsLoop);
    } finally {
      if (ownsLoop()) {
        generation.inFlight = false;
        const pending = generation.pending;
        generation.pending = undefined;
        if (pending) this.request(pending.poll, Math.max(0, pending.dueAt - Date.now()));
        else if (nextDelay !== undefined) this.request(poll, nextDelay);
        this.wakeIdleWaiters();
      }
    }
  }
}
