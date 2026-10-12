export interface PlaybackPosition {
  positionMs: number;
  durationMs: number;
}

type Listener = () => void;

export const NO_PLAYBACK_POSITION: PlaybackPosition = { positionMs: 0, durationMs: 0 };

export class PlaybackPositionStore {
  private snapshot: PlaybackPosition = NO_PLAYBACK_POSITION;
  private readonly listeners = new Set<Listener>();

  getSnapshot = (): PlaybackPosition => this.snapshot;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  set(positionMs: number, durationMs: number): void {
    if (this.snapshot.positionMs === positionMs && this.snapshot.durationMs === durationMs) return;
    this.snapshot = { positionMs, durationMs };
    this.listeners.forEach((listener) => listener());
  }

  setPosition(positionMs: number): void {
    this.set(positionMs, this.snapshot.durationMs);
  }

  reset(): void {
    this.set(0, 0);
  }
}
