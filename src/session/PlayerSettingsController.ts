import { SettingsApi, SettingsApiError, SettingsErrorKind } from '../data/SettingsApi';
import {
  SettingDescriptor,
  SettingsSchema,
  SettingsSnapshot,
  SettingValue,
  SettingValues,
} from '../core/settingsModels';

export type PlayerSettingsPhase = 'loading' | 'ready' | 'unsupported' | 'error';

export interface PlayerSettingsState {
  phase: PlayerSettingsPhase;
  schema: SettingsSchema | null;
  values: SettingValues;
  epoch: number;
  revision: number;
  /** False while the player's "Allow remote settings changes" switch is off. */
  writable: boolean;
  /** Keys with a change on its way to the player. */
  busyKeys: readonly string[];
  /** Keys stored on the player but applied later (next track, next use, next boot). */
  pendingApply: Readonly<Record<string, string>>;
  rescanBusy: boolean;
  error: SettingsErrorKind | null;
}

export type PlayerSettingsNotice =
  | { kind: 'saved'; key: string; apply: string | null }
  | { kind: 'conflict' }
  | { kind: 'switch_off' }
  | { kind: 'failed'; error: SettingsErrorKind; key?: string }
  | { kind: 'rescan_started' }
  | { kind: 'rescan_running' };

/** The switch does not move the revision, so a loaded read-only screen looks again now and then; no other phase does. */
export function shouldRecheckWritable(state: Pick<PlayerSettingsState, 'phase' | 'writable'>, foreground: boolean): boolean {
  return foreground && state.phase === 'ready' && !state.writable;
}

/** True when raising `key` to `next` crosses the player's loud-volume level and needs a confirmation. */
export function needsLoudConfirmation(descriptor: SettingDescriptor, current: SettingValue | undefined, next: SettingValue): boolean {
  if (descriptor.confirmAbove == null || typeof next !== 'number') return false;
  if (next <= descriptor.confirmAbove) return false;
  return typeof current !== 'number' || next > current;
}

/**
 * Holds the player's settings for one visit to the Player settings screen: loads the schema and values,
 * keeps them in step with the player's revision, and sends changes one at a time with rollback.
 * Framework free so it can be tested without React.
 */
export class PlayerSettingsController {
  private state: PlayerSettingsState = {
    phase: 'loading', schema: null, values: {}, epoch: 0, revision: 0, writable: false,
    busyKeys: [], pendingApply: {}, rescanBusy: false, error: null,
  };
  private listeners = new Set<() => void>();
  private queue: Promise<void> = Promise.resolve();
  private inFlight = 0;
  private refreshing: Promise<void> | null = null;
  private disposed = false;
  /** Newest revision and epoch seen in a status poll, replayed once the writes in flight are done. */
  private lastStatus: { revision: number; epoch: number } | null = null;
  private readonly notify: (notice: PlayerSettingsNotice) => void;

  constructor(
    private readonly api: SettingsApi,
    notify: (notice: PlayerSettingsNotice) => void = () => undefined,
  ) {
    // Nothing is reported after dispose: a closed screen or a replaced connection stays silent.
    this.notify = (notice) => { if (!this.disposed) notify(notice); };
  }

  getState = (): PlayerSettingsState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
  }

  private set(patch: Partial<PlayerSettingsState>): void {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  private applySnapshot(snapshot: SettingsSnapshot, replace: boolean): void {
    const values = replace || snapshot.full ? { ...snapshot.values } : { ...this.state.values, ...snapshot.values };
    this.set({ values, epoch: snapshot.epoch, revision: snapshot.revision, writable: snapshot.writable });
  }

  async load(): Promise<void> {
    this.set({ phase: 'loading', error: null });
    try {
      const schema = await this.api.schema();
      const snapshot = await this.api.values();
      this.set({ schema });
      this.applySnapshot(snapshot, true);
      this.set({ phase: 'ready' });
    } catch (error) {
      this.fail(error);
    }
  }

  private fail(error: unknown): void {
    const kind = error instanceof SettingsApiError ? error.kind : 'unknown';
    this.set({ phase: kind === 'unsupported' ? 'unsupported' : 'error', error: kind });
  }

  /** Called with every status poll. Refetches only what changed on the player; never overlaps a write. */
  syncFromStatus(revision: number | null | undefined, epoch: number | null | undefined): void {
    if (revision == null || epoch == null) return;
    this.lastStatus = { revision, epoch };
    if (this.state.phase !== 'ready' || this.inFlight > 0) return;
    const changed = epoch !== this.state.epoch || revision !== this.state.revision;
    if (changed) void this.refresh();
  }

  /** Delta refetch (full when the epoch moved). Concurrent calls share one request. */
  refresh(): Promise<void> {
    if (this.refreshing) return this.refreshing;
    const since = { revision: this.state.revision, epoch: this.state.epoch };
    this.refreshing = (async () => {
      try {
        const snapshot = await this.api.values(since);
        // A write that started meanwhile settles its own state; the next status poll catches up.
        if (this.inFlight === 0) this.applySnapshot(snapshot, false);
      } catch (error) {
        if (error instanceof SettingsApiError && error.kind !== 'unknown' && error.kind !== 'player_busy') this.fail(error);
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }

  /** Change one setting. Resolves when the player has answered; the value is shown at once and rolled back on failure. */
  change(key: string, value: SettingValue, acknowledge = false): Promise<void> {
    const descriptor = this.state.schema?.settings.find((s) => s.key === key);
    if (!descriptor || descriptor.readOnly || !descriptor.available || this.state.phase !== 'ready') return Promise.resolve();
    const previous = this.state.values[key];
    this.set({ values: { ...this.state.values, [key]: value }, busyKeys: [...this.state.busyKeys, key] });
    this.inFlight++;
    const run = async () => {
      let refreshAfter = false;
      try {
        const base = { revision: this.state.revision, epoch: this.state.epoch };
        const result = await this.api.write({
          changes: { [key]: value },
          baseRevision: base.revision,
          epoch: base.epoch,
          acknowledge: acknowledge ? [key] : undefined,
        });
        const pending = result.pending.find((p) => p.key === key);
        const pendingApply = { ...this.state.pendingApply };
        if (pending) pendingApply[key] = pending.reason; else delete pendingApply[key];
        this.set({ pendingApply });
        try {
          this.applySnapshot(await this.api.values(base), false);
        } catch {
          // Keep the old base revision so the next status poll refetches what we could not read now.
          const values = { ...this.state.values };
          for (const other of result.alsoChanged) {
            if (isBoolSetting(this.state.schema, other)) values[other] = false;
          }
          this.set({ values });
        }
        this.notify({ kind: 'saved', key, apply: pending?.reason ?? null });
      } catch (error) {
        refreshAfter = await this.rollback(key, previous, error);
      } finally {
        this.inFlight--;
        const busy = [...this.state.busyKeys];
        const at = busy.indexOf(key);
        if (at >= 0) busy.splice(at, 1);
        this.set({ busyKeys: busy });
        // After the write is settled, so the answer is not dropped as stale.
        if (refreshAfter) void this.refresh();
        else if (this.inFlight === 0 && this.lastStatus) this.syncFromStatus(this.lastStatus.revision, this.lastStatus.epoch);
      }
    };
    const task = this.queue.then(run, run);
    this.queue = task;
    return task;
  }

  /** Restores the value and reports; resolves true when the player's state should be reread afterwards. */
  private async rollback(key: string, previous: SettingValue | undefined, error: unknown): Promise<boolean> {
    const kind: SettingsErrorKind = error instanceof SettingsApiError ? error.kind : 'unknown';
    const restored = { ...this.state.values };
    if (previous === undefined) delete restored[key]; else restored[key] = previous;
    this.set({ values: restored });
    if (kind === 'revision_mismatch') {
      const current = error instanceof SettingsApiError ? error.current : null;
      if (current) this.applySnapshot(current, true);
      else await this.load();
      this.notify({ kind: 'conflict' });
      return false;
    } else if (kind === 'switch_off') {
      this.set({ writable: false });
      this.notify({ kind: 'switch_off' });
      return false;
    }
    this.notify({ kind: 'failed', error: kind, key });
    // A busy player or a timeout may still have applied the change: look at what the player has.
    return kind === 'player_busy' || kind === 'unknown';
  }

  async runAction(id: string): Promise<void> {
    if (this.state.rescanBusy) return;
    this.set({ rescanBusy: true });
    try {
      await this.api.runAction(id);
      this.notify({ kind: 'rescan_started' });
    } catch (error) {
      const kind: SettingsErrorKind = error instanceof SettingsApiError ? error.kind : 'unknown';
      if (kind === 'rescan_running') this.notify({ kind: 'rescan_running' });
      else if (kind === 'switch_off') { this.set({ writable: false }); this.notify({ kind: 'switch_off' }); }
      else this.notify({ kind: 'failed', error: kind });
    } finally {
      this.set({ rescanBusy: false });
    }
  }
}

function isBoolSetting(schema: SettingsSchema | null, key: string): boolean {
  return schema?.settings.find((s) => s.key === key)?.type === 'bool';
}
