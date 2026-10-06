/**
 * PlaybackStatusGate reconciles play/pause commands with player status without
 * flashing stale pre-command reads.
 * Direct port of PlaybackStatusGate.kt.
 */

export enum CommandOutcome {
  Succeeded = 'Succeeded',
  Failed = 'Failed',
  Uncertain = 'Uncertain',
}

export interface StatusSnapshot {
  generation: number;
  commandInFlight: boolean;
}

type Action =
  | { type: 'Toggle'; outcome?: CommandOutcome | null }
  | { type: 'SetPlayback'; value: boolean; outcome?: CommandOutcome | null };

export class PlaybackStatusGate {
  static readonly DEFAULT_CONFIRMATION_GRACE_MS = 5000;

  private readonly confirmationGraceMs: number;
  private generation = 0;
  private lastConfirmedPlayback = false;
  private hasConfirmedStatus = false;
  private batchActive = false;
  private batchBaseline = false;
  private batchActions = new Map<number, Action>();
  private inFlightActions = new Set<number>();
  private expectedPlayback: boolean | null = null;
  private confirmationStartedAtMs: number | null = null;

  constructor(confirmationGraceMs: number = PlaybackStatusGate.DEFAULT_CONFIRMATION_GRACE_MS) {
    this.confirmationGraceMs = confirmationGraceMs;
  }

  get confirmedPlayback(): boolean {
    return this.lastConfirmedPlayback;
  }

  get hasUnconfirmedAction(): boolean {
    return this.batchActive;
  }

  get confirmedPaused(): boolean {
    return this.hasConfirmedStatus && !this.lastConfirmedPlayback && !this.batchActive;
  }

  snapshot(): StatusSnapshot {
    return {
      generation: this.generation,
      commandInFlight: this.inFlightActions.size > 0,
    };
  }

  beginAction(): number {
    this.beginBatchIfNeeded();
    this.generation += 1;
    this.batchActions.set(this.generation, { type: 'Toggle', outcome: null });
    this.inFlightActions.add(this.generation);
    this.expectedPlayback = null;
    this.confirmationStartedAtMs = null;
    return this.generation;
  }

  beginExplicitAction(targetPlayback: boolean): number {
    this.beginBatchIfNeeded();
    this.generation += 1;
    this.batchActions.set(this.generation, {
      type: 'SetPlayback',
      value: targetPlayback,
      outcome: null,
    });
    this.inFlightActions.add(this.generation);
    this.expectedPlayback = null;
    this.confirmationStartedAtMs = null;
    return this.generation;
  }

  finishAction(
    actionGeneration: number,
    outcome: CommandOutcome,
    nowMs: number
  ): boolean | null {
    if (!this.inFlightActions.delete(actionGeneration)) return null;
    const action = this.batchActions.get(actionGeneration);
    if (!action) return null;
    action.outcome = outcome;

    if (this.inFlightActions.size > 0) return null;

    // Fold actions in dispatch order
    let predictedPlayback = this.batchBaseline;
    for (const act of Array.from(this.batchActions.values())) {
      if (act.type === 'Toggle') {
        if (act.outcome !== CommandOutcome.Failed) {
          predictedPlayback = !predictedPlayback;
        }
      } else if (act.type === 'SetPlayback') {
        if (act.outcome !== CommandOutcome.Failed) {
          predictedPlayback = act.value;
        }
      }
    }
    this.expectedPlayback = predictedPlayback;
    this.confirmationStartedAtMs = nowMs;
    return predictedPlayback;
  }

  confirmStatus(snapshot: StatusSnapshot, statusPlaying: boolean, nowMs: number): boolean {
    if (
      snapshot.generation !== this.generation ||
      snapshot.commandInFlight ||
      this.inFlightActions.size > 0
    ) {
      return false;
    }

    if (this.batchActive) {
      if (this.expectedPlayback === null) return false;
      const confirmationStarted = this.confirmationStartedAtMs ?? nowMs;
      const elapsed = nowMs - confirmationStarted;

      const hasUncertain = Array.from(this.batchActions.values()).some(
        (a) => a.outcome === CommandOutcome.Uncertain
      );

      if (
        elapsed < this.confirmationGraceMs &&
        (statusPlaying !== this.expectedPlayback || hasUncertain)
      ) {
        return false;
      }

      this.batchActive = false;
      this.batchActions.clear();
      this.expectedPlayback = null;
      this.confirmationStartedAtMs = null;
    }

    this.lastConfirmedPlayback = statusPlaying;
    this.hasConfirmedStatus = true;
    return true;
  }

  reset(): void {
    this.generation += 1;
    this.lastConfirmedPlayback = false;
    this.hasConfirmedStatus = false;
    this.batchActive = false;
    this.batchBaseline = false;
    this.batchActions.clear();
    this.inFlightActions.clear();
    this.expectedPlayback = null;
    this.confirmationStartedAtMs = null;
  }

  private beginBatchIfNeeded(): void {
    if (this.batchActive) return;
    this.batchActive = true;
    this.batchBaseline = this.lastConfirmedPlayback;
    this.batchActions.clear();
  }
}
