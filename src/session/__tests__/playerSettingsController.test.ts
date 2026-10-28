import { PlayerSettingsController, PlayerSettingsNotice, needsLoudConfirmation, shouldRecheckWritable } from '../PlayerSettingsController';
import { SettingsApi, SettingsApiError } from '../../data/SettingsApi';
import { parseSchema, SettingsSnapshot, SettingsWriteRequest, SettingsWriteResult } from '../../core/settingsModels';

const SCHEMA = parseSchema({
  schemaVersion: 1,
  device: { model: 'HiBy R1' },
  groups: [{ id: 'sound', label: 'Sound', labelId: 'Sound' }],
  settings: [
    { key: 'max_volume_percent', group: 'sound', label: 'Max Volume', labelId: 'Max Volume', type: 'percent', apply: 'live', available: true, min: 1, max: 100, unit: '%', confirmAbove: 85 },
    { key: 'gapless_enabled', group: 'sound', label: 'Gapless', labelId: 'Gapless', type: 'bool', apply: 'live', available: true },
    { key: 'replaygain_mode', group: 'sound', label: 'ReplayGain', labelId: 'ReplayGain', type: 'enum', apply: 'next_track', available: true, options: [{ value: 0, label: 'Off', labelId: 'Off' }] },
    { key: 'crossfade_enabled', group: 'sound', label: 'Crossfade', labelId: 'Crossfade', type: 'bool', apply: 'live', available: true, dependsOn: 'gapless_enabled' },
    { key: 'wifi_enabled', group: 'sound', label: 'Wi-Fi', labelId: 'Wi-Fi', type: 'bool', apply: 'live', available: true, readOnly: true },
  ],
  actions: [{ id: 'library.rescan', group: 'library', label: 'Update', labelId: 'Update' }],
});

const snap = (revision: number, values: Record<string, any>, extra: Partial<SettingsSnapshot> = {}): SettingsSnapshot =>
  ({ epoch: 100, revision, full: true, writable: true, values, ...extra });

class FakeApi {
  schemaCalls = 0;
  valuesCalls: Array<{ revision: number; epoch: number } | undefined> = [];
  writes: SettingsWriteRequest[] = [];
  valuesQueue: Array<SettingsSnapshot | Error> = [];
  writeQueue: Array<SettingsWriteResult | Error> = [];
  actionResult: Error | null = null;
  async schema() { this.schemaCalls++; return SCHEMA; }
  async values(since?: { revision: number; epoch: number }) {
    this.valuesCalls.push(since);
    const next = this.valuesQueue.shift();
    if (!next) throw new Error('no snapshot scripted');
    if (next instanceof Error) throw next;
    return next;
  }
  async write(request: SettingsWriteRequest) {
    this.writes.push(request);
    const next = this.writeQueue.shift();
    if (!next) throw new Error('no write scripted');
    if (next instanceof Error) throw next;
    return next;
  }
  async runAction(_id: string) { if (this.actionResult) throw this.actionResult; }
}

const ok = (revision: number, pending: SettingsWriteResult['pending'] = []): SettingsWriteResult =>
  ({ epoch: 100, revision, applied: [], pending, alsoChanged: [] });

function setup() {
  const api = new FakeApi();
  const notices: PlayerSettingsNotice[] = [];
  const controller = new PlayerSettingsController(api as unknown as SettingsApi, (n) => notices.push(n));
  return { api, notices, controller };
}

async function loaded(values = { max_volume_percent: 70, gapless_enabled: true, replaygain_mode: 0, wifi_enabled: true }) {
  const ctx = setup();
  ctx.api.valuesQueue.push(snap(5, values));
  await ctx.controller.load();
  return ctx;
}

describe('PlayerSettingsController loading and refresh', () => {
  it('loads schema and a full snapshot', async () => {
    const { controller } = await loaded();
    const state = controller.getState();
    expect(state.phase).toBe('ready');
    expect(state).toMatchObject({ epoch: 100, revision: 5, writable: true });
    expect(state.values.max_volume_percent).toBe(70);
  });

  it('reports an old player as unsupported', async () => {
    const { api, controller } = setup();
    api.schema = async () => { throw new SettingsApiError('unsupported', 404, 'unsupported'); };
    await controller.load();
    expect(controller.getState().phase).toBe('unsupported');
  });

  it('refetches only the changes when the revision moves, and merges them', async () => {
    const { api, controller } = await loaded();
    api.valuesQueue.push(snap(6, { gapless_enabled: false }, { full: false }));
    controller.syncFromStatus(6, 100);
    await controller.refresh();
    expect(api.valuesCalls[1]).toEqual({ revision: 5, epoch: 100 });
    expect(controller.getState().values).toMatchObject({ gapless_enabled: false, max_volume_percent: 70 });
    expect(controller.getState().revision).toBe(6);
  });

  it('does nothing while the status matches', async () => {
    const { api, controller } = await loaded();
    controller.syncFromStatus(5, 100);
    expect(api.valuesCalls).toHaveLength(1);
  });

  it('drops the cache when the epoch changes (the player rebooted)', async () => {
    const { api, controller } = await loaded();
    api.valuesQueue.push(snap(0, { max_volume_percent: 40 }, { epoch: 222, full: true }));
    controller.syncFromStatus(5, 222);
    await controller.refresh();
    expect(api.valuesCalls[1]).toEqual({ revision: 5, epoch: 100 });
    expect(controller.getState()).toMatchObject({ epoch: 222, revision: 0 });
    expect(controller.getState().values).toEqual({ max_volume_percent: 40 });
  });

  it('shares one request between concurrent refreshes', async () => {
    const { api, controller } = await loaded();
    api.valuesQueue.push(snap(6, {}, { full: false }));
    await Promise.all([controller.refresh(), controller.refresh()]);
    expect(api.valuesCalls).toHaveLength(2);
  });

  it('shows the switch-off state from writable=false', async () => {
    const { api, controller } = setup();
    api.valuesQueue.push(snap(1, { gapless_enabled: true }, { writable: false }));
    await controller.load();
    expect(controller.getState().writable).toBe(false);
  });
});

describe('PlayerSettingsController changes', () => {
  it('shows the value at once, sends base revision and epoch, then refetches the delta', async () => {
    const { api, notices, controller } = await loaded();
    api.writeQueue.push(ok(6));
    api.valuesQueue.push(snap(6, { gapless_enabled: false }, { full: false }));
    const done = controller.change('gapless_enabled', false);
    expect(controller.getState().values.gapless_enabled).toBe(false);
    expect(controller.getState().busyKeys).toEqual(['gapless_enabled']);
    await done;
    expect(api.writes[0]).toEqual({ changes: { gapless_enabled: false }, baseRevision: 5, epoch: 100, acknowledge: undefined });
    expect(api.valuesCalls[1]).toEqual({ revision: 5, epoch: 100 });
    expect(controller.getState()).toMatchObject({ revision: 6, busyKeys: [] });
    expect(notices).toEqual([{ kind: 'saved', key: 'gapless_enabled', apply: null }]);
  });

  it('records a pending apply from the response', async () => {
    const { api, notices, controller } = await loaded();
    api.writeQueue.push(ok(6, [{ key: 'replaygain_mode', reason: 'next_track' }]));
    api.valuesQueue.push(snap(6, { replaygain_mode: 0 }, { full: false }));
    await controller.change('replaygain_mode', 0);
    expect(controller.getState().pendingApply).toEqual({ replaygain_mode: 'next_track' });
    expect(notices[0]).toEqual({ kind: 'saved', key: 'replaygain_mode', apply: 'next_track' });
  });

  it('rolls the value back and reports when the write fails', async () => {
    const { api, notices, controller } = await loaded();
    api.writeQueue.push(new SettingsApiError('player_busy', 503, 'player_busy'));
    api.valuesQueue.push(snap(5, {}, { full: false }));
    await controller.change('max_volume_percent', 50);
    expect(controller.getState().values.max_volume_percent).toBe(70);
    expect(controller.getState().busyKeys).toEqual([]);
    expect(notices).toEqual([{ kind: 'failed', error: 'player_busy', key: 'max_volume_percent' }]);
  });

  it('on 409 reloads from the answer, tells the user and keeps the player value', async () => {
    const { api, notices, controller } = await loaded();
    api.writeQueue.push(new SettingsApiError('revision_mismatch', 409, 'revision_mismatch', [], snap(9, { max_volume_percent: 60, gapless_enabled: true })));
    await controller.change('max_volume_percent', 50);
    expect(controller.getState().values.max_volume_percent).toBe(60);
    expect(controller.getState().revision).toBe(9);
    expect(notices).toEqual([{ kind: 'conflict' }]);
  });

  it('on 409 without a body does a full reload', async () => {
    const { api, notices, controller } = await loaded();
    api.writeQueue.push(new SettingsApiError('revision_mismatch', 409, 'revision_mismatch'));
    api.valuesQueue.push(snap(11, { max_volume_percent: 33 }));
    await controller.change('max_volume_percent', 50);
    expect(controller.getState().values.max_volume_percent).toBe(33);
    expect(api.valuesCalls[1]).toBeUndefined();
    expect(notices).toEqual([{ kind: 'conflict' }]);
  });

  it('turns the screen read-only when the switch is off', async () => {
    const { api, notices, controller } = await loaded();
    api.writeQueue.push(new SettingsApiError('switch_off', 403, 'remote_changes_disabled'));
    await controller.change('gapless_enabled', false);
    expect(controller.getState().writable).toBe(false);
    expect(controller.getState().values.gapless_enabled).toBe(true);
    expect(notices).toEqual([{ kind: 'switch_off' }]);
  });

  it('sends acknowledge for a confirmed loud volume', async () => {
    const { api, controller } = await loaded();
    api.writeQueue.push(ok(6));
    api.valuesQueue.push(snap(6, { max_volume_percent: 95 }, { full: false }));
    await controller.change('max_volume_percent', 95, true);
    expect(api.writes[0].acknowledge).toEqual(['max_volume_percent']);
  });

  it('ignores read-only and unknown keys', async () => {
    const { api, controller } = await loaded();
    await controller.change('wifi_enabled', false);
    await controller.change('nope', 1);
    expect(api.writes).toHaveLength(0);
    expect(controller.getState().values.wifi_enabled).toBe(true);
  });

  it('sends changes one at a time using the newest revision', async () => {
    const { api, controller } = await loaded();
    api.writeQueue.push(ok(6), ok(7));
    api.valuesQueue.push(snap(6, {}, { full: false }), snap(7, {}, { full: false }));
    await Promise.all([controller.change('gapless_enabled', false), controller.change('max_volume_percent', 50)]);
    expect(api.writes.map((w) => w.baseRevision)).toEqual([5, 6]);
  });

  it('does not refetch from a status poll while a write is on its way', async () => {
    const { api, controller } = await loaded();
    api.writeQueue.push(ok(6));
    api.valuesQueue.push(snap(6, {}, { full: false }));
    const done = controller.change('gapless_enabled', false);
    controller.syncFromStatus(6, 100);
    await done;
    expect(api.valuesCalls).toHaveLength(2);
  });
});

describe('PlayerSettingsController actions and confirmation', () => {
  it('starts a rescan and reports it', async () => {
    const { notices, controller } = await loaded();
    await controller.runAction('library.rescan');
    expect(notices).toEqual([{ kind: 'rescan_started' }]);
    expect(controller.getState().rescanBusy).toBe(false);
  });

  it('reports a rescan that is already running', async () => {
    const { api, notices, controller } = await loaded();
    api.actionResult = new SettingsApiError('rescan_running', 409, 'rescan_running');
    await controller.runAction('library.rescan');
    expect(notices).toEqual([{ kind: 'rescan_running' }]);
  });

  it('asks for confirmation only when raising above the loud level', () => {
    const volume = SCHEMA.settings[0];
    expect(needsLoudConfirmation(volume, 70, 85)).toBe(false);
    expect(needsLoudConfirmation(volume, 70, 86)).toBe(true);
    expect(needsLoudConfirmation(volume, 100, 90)).toBe(false);
    expect(needsLoudConfirmation(volume, 90, 95)).toBe(true);
    expect(needsLoudConfirmation(SCHEMA.settings[1], true, false)).toBe(false);
  });
});

describe('PlayerSettingsController review fixes', () => {
  it('keeps the old base revision when the read after a write fails, so the next poll refetches', async () => {
    const { api, controller } = await loaded();
    api.writeQueue.push({ ...ok(6), alsoChanged: ['crossfade_enabled'] });
    api.valuesQueue.push(new Error('network'));
    await controller.change('gapless_enabled', false);
    expect(controller.getState().revision).toBe(5);
    api.valuesQueue.push(snap(6, { crossfade_enabled: false }, { full: false }));
    controller.syncFromStatus(6, 100);
    await controller.refresh();
    expect(api.valuesCalls[2]).toEqual({ revision: 5, epoch: 100 });
    expect(controller.getState().revision).toBe(6);
  });

  it('applies alsoChanged locally when it cannot read back', async () => {
    const { api, controller } = await loaded({ max_volume_percent: 70, gapless_enabled: true, replaygain_mode: 0, wifi_enabled: true, crossfade_enabled: true } as any);
    api.writeQueue.push({ ...ok(6), alsoChanged: ['crossfade_enabled'] });
    api.valuesQueue.push(new Error('network'));
    await controller.change('gapless_enabled', false);
    expect(controller.getState().values.crossfade_enabled).toBe(false);
  });

  it('rereads after a timeout or unknown error, and the answer is kept', async () => {
    const { api, controller } = await loaded();
    api.writeQueue.push(new SettingsApiError('unknown', 0, 'unknown'));
    api.valuesQueue.push(snap(6, { gapless_enabled: false }, { full: false }));
    await controller.change('gapless_enabled', false);
    await new Promise<void>((resolve) => setImmediate(() => resolve()));
    expect(api.valuesCalls).toHaveLength(2);
    expect(controller.getState().values.gapless_enabled).toBe(false);
    expect(controller.getState().revision).toBe(6);
  });

  it('rereads after a busy player and keeps the answer', async () => {
    const { api, controller } = await loaded();
    api.writeQueue.push(new SettingsApiError('player_busy', 503, 'player_busy'));
    api.valuesQueue.push(snap(6, { max_volume_percent: 50 }, { full: false }));
    await controller.change('max_volume_percent', 50);
    await new Promise<void>((resolve) => setImmediate(() => resolve()));
    expect(controller.getState().values.max_volume_percent).toBe(50);
  });

  it('stays silent after dispose', async () => {
    const { api, notices, controller } = await loaded();
    api.writeQueue.push(new SettingsApiError('unknown', 0, 'unknown'));
    const done = controller.change('gapless_enabled', false);
    controller.dispose();
    await done;
    expect(notices).toEqual([]);
  });

  it('rechecks the switch only on a loaded screen in the foreground', () => {
    expect(shouldRecheckWritable({ phase: 'ready', writable: false }, true)).toBe(true);
    expect(shouldRecheckWritable({ phase: 'ready', writable: false }, false)).toBe(false);
    expect(shouldRecheckWritable({ phase: 'error', writable: false }, true)).toBe(false);
    expect(shouldRecheckWritable({ phase: 'unsupported', writable: false }, true)).toBe(false);
    expect(shouldRecheckWritable({ phase: 'loading', writable: false }, true)).toBe(false);
    expect(shouldRecheckWritable({ phase: 'ready', writable: true }, true)).toBe(false);
  });

  it('replays a status revision seen during a write whose read-back then failed', async () => {
    const { api, controller } = await loaded();
    api.writeQueue.push(ok(6));
    api.valuesQueue.push(new Error('network'), snap(6, { replaygain_mode: 0, max_volume_percent: 60 }, { full: false }));
    const done = controller.change('replaygain_mode', 0);
    controller.syncFromStatus(6, 100); // skipped: a write is in flight
    await done;
    await new Promise<void>((resolve) => setImmediate(() => resolve()));
    expect(api.valuesCalls).toHaveLength(3);
    expect(api.valuesCalls[2]).toEqual({ revision: 5, epoch: 100 });
    expect(controller.getState().values.max_volume_percent).toBe(60);
    expect(controller.getState().revision).toBe(6);
  });
});
