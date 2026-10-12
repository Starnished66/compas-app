import { RemoteTrack } from '../data/types';
import { TrackIdentity, trackKey } from '../ui/trackKey';

export interface NowPlayingArtworkLookup {
  local(track: TrackIdentity): Promise<string | null>;
  remote(track: TrackIdentity, commandGeneration: number): Promise<string | null>;
}

export interface RemoteArtworkPermission {
  allowed: boolean;
  commandGeneration: number;
}

export type ArtworkChangeListener = (artwork: string | null, key: string) => void;

type LookupStage = 'local' | 'awaitingRemote' | 'remote' | 'failed' | 'resolved' | 'missing';

export const ARTWORK_HOLD_MS = 1500;
export const FAILED_ARTWORK_RETRY_MS = 3000;

export class NowPlayingArtwork {
  private track: TrackIdentity | null = null;
  private key: string | null = null;
  private stage: LookupStage = 'resolved';
  private shown: string | null = null;
  private shownKey: string | null = null;
  private permission: RemoteArtworkPermission = { allowed: false, commandGeneration: 0 };
  private failedAtMs = 0;
  private holdTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly lookup: NowPlayingArtworkLookup,
    private readonly onChange: ArtworkChangeListener,
    private readonly holdMs: number = ARTWORK_HOLD_MS,
    private readonly now: () => number = Date.now
  ) {}

  get artwork(): string | null {
    return this.shown;
  }

  sync(track: TrackIdentity, permission: RemoteArtworkPermission): string | null {
    this.permission = permission;
    const key = trackKey(track)!;
    if (key !== this.key) this.begin(track, key);
    else this.requestRemote();
    return this.shown;
  }

  reset(): void {
    this.clearHold();
    this.track = null;
    this.key = null;
    this.stage = 'resolved';
    this.shown = null;
    this.shownKey = null;
  }

  private begin({ title, artist, album }: TrackIdentity, key: string): void {
    const track = { title, artist, album };
    this.track = track;
    this.key = key;
    this.stage = 'local';
    this.clearHold();
    if (this.shown) this.holdTimer = setTimeout(() => this.releaseHold(key), this.holdMs);
    this.lookup.local(track).then(
      (artwork) => this.settleLocal(key, artwork),
      () => this.settleLocal(key, null)
    );
  }

  private settleLocal(key: string, artwork: string | null): void {
    if (key !== this.key) return;
    if (artwork) {
      this.show(key, artwork);
      return;
    }
    this.stage = 'awaitingRemote';
    this.requestRemote();
  }

  private requestRemote(): void {
    const track = this.track;
    const key = this.key;
    if (!track || !key || !this.permission.allowed || !this.remoteDue()) return;
    this.stage = 'remote';
    this.lookup.remote(track, this.permission.commandGeneration).then(
      (artwork) => {
        if (key !== this.key) return;
        if (artwork) this.show(key, artwork);
        else this.showMissing(key);
      },
      () => {
        if (key !== this.key) return;
        this.stage = 'failed';
        this.failedAtMs = this.now();
      }
    );
  }

  private remoteDue(): boolean {
    if (this.stage === 'awaitingRemote') return true;
    return this.stage === 'failed' && this.now() - this.failedAtMs >= FAILED_ARTWORK_RETRY_MS;
  }

  private show(key: string, artwork: string): void {
    this.stage = 'resolved';
    this.display(key, artwork);
  }

  private showMissing(key: string): void {
    this.stage = 'missing';
    this.display(key, null);
  }

  private releaseHold(key: string): void {
    this.holdTimer = null;
    if (key === this.key && this.shownKey !== key) this.display(key, null);
  }

  private display(key: string, artwork: string | null): void {
    this.clearHold();
    this.shownKey = key;
    if (this.shown === artwork) return;
    this.shown = artwork;
    this.onChange(artwork, key);
  }

  private clearHold(): void {
    if (this.holdTimer) clearTimeout(this.holdTimer);
    this.holdTimer = null;
  }
}

export function trackWithArtwork(track: RemoteTrack | null | undefined, key: string, artwork: string | null): RemoteTrack | null {
  if (!track || trackKey(track) !== key || (track.artwork ?? null) === artwork) return null;
  return { ...track, artwork: artwork ?? undefined };
}
