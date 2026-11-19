type Poll = (ownsLoop: () => boolean) => Promise<number | undefined>;

interface PollGeneration {
  timer?: ReturnType<typeof setTimeout>;
  inFlight: boolean;
  pending?: { poll: Poll; dueAt: number };
}

export class StatusPollLoop {
  private generation: PollGeneration = { inFlight: false };

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
      }
    }
  }
}
