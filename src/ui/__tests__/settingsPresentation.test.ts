import { parseSchema, SettingDescriptor } from '../../core/settingsModels';
import {
  applyBadge, choiceOptions, controlKindFor, formatSettingValue, groupIcon, groupSummary, localizedLabel,
  noticeText, savedNotice, sliderToValue, unmetDependency, valueToSlider, visibleGroups,
} from '../components/settings/settingsPresentation';

const base = { group: 'sound', label: 'X', labelId: 'X', apply: 'live', available: true };
const schema = parseSchema({
  schemaVersion: 1,
  groups: [
    { id: 'sound', label: 'Sound', labelId: 'Sound' },
    { id: 'display', label: 'Display', labelId: 'Display' },
    { id: 'library', label: 'Library', labelId: 'Library' },
    { id: 'power', label: 'Power', labelId: 'Power' },
  ],
  settings: [
    { ...base, key: 'a', type: 'percent', min: 1, max: 100, unit: '%', label: 'Max Volume', labelId: 'Max Volume' },
    { ...base, key: 'g', type: 'bool', label: 'Gapless', labelId: 'Gapless' },
    { ...base, key: 'c', type: 'bool', dependsOn: 'g', label: 'Crossfade', labelId: 'Crossfade' },
    { ...base, key: 'r', group: 'display', type: 'enum', options: [{ value: 0, label: 'Off', labelId: 'Off' }, { value: 1, label: 'Track', labelId: 'Per Track' }] },
    { ...base, key: 'dre', group: 'display', type: 'bool', available: false, reason: 'not_on_this_model' },
  ],
  actions: [{ id: 'library.rescan', group: 'library', label: 'Update', labelId: 'Update' }],
});
const find = (key: string) => schema.settings.find((s) => s.key === key)!;
const raw = (extra: Record<string, unknown>): SettingDescriptor => parseSchema({ schemaVersion: 1, groups: [], settings: [{ ...base, key: 'k', ...extra }] }).settings[0];

describe('control selection per schema type', () => {
  it('draws bool as a toggle', () => expect(controlKindFor(raw({ type: 'bool' }))).toBe('toggle'));
  it('draws a short enum as segments and a long one as a choice list', () => {
    const options = (n: number) => Array.from({ length: n }, (_, i) => ({ value: i, label: `o${i}`, labelId: `o${i}` }));
    expect(controlKindFor(raw({ type: 'enum', options: options(4) }))).toBe('segmented');
    expect(controlKindFor(raw({ type: 'enum', options: options(5) }))).toBe('choice');
    expect(controlKindFor(raw({ type: 'enum', options: [] }))).toBe('hidden');
  });
  it('draws presets by count and int/percent as a slider', () => {
    expect(controlKindFor(raw({ type: 'preset', values: [1, 2, 3] }))).toBe('segmented');
    expect(controlKindFor(raw({ type: 'preset', values: [15, 30, 60, 120, 300] }))).toBe('choice');
    expect(controlKindFor(raw({ type: 'int', min: 0, max: 10 }))).toBe('slider');
    expect(controlKindFor(raw({ type: 'percent', min: 5, max: 100 }))).toBe('slider');
    expect(controlKindFor(raw({ type: 'int' }))).toBe('hidden');
  });
  it('locks read-only and string entries and hides unavailable ones', () => {
    expect(controlKindFor(raw({ type: 'bool', readOnly: true, reason: 'would_lock_out_remote' }))).toBe('locked');
    expect(controlKindFor(raw({ type: 'string' }))).toBe('locked');
    expect(controlKindFor(find('dre'))).toBe('hidden');
  });
});

describe('settings presentation helpers', () => {
  const t = (s: string) => s;
  it('maps slider positions to whole values and back', () => {
    const volume = find('a');
    expect(sliderToValue(volume, 0)).toBe(1);
    expect(sliderToValue(volume, 1)).toBe(100);
    expect(sliderToValue(volume, 0.5)).toBe(51);
    expect(sliderToValue(volume, 5)).toBe(100);
    expect(valueToSlider(volume, 100)).toBe(1);
    expect(valueToSlider(volume, 1)).toBe(0);
  });
  it('formats values with units and option labels', () => {
    expect(formatSettingValue(find('a'), 80, 'en', t)).toBe('80%');
    expect(formatSettingValue(find('g'), true, 'en', t)).toBe('On');
    expect(formatSettingValue(find('r'), 1, 'en', t)).toBe('Per Track');
    expect(choiceOptions(raw({ type: 'preset', values: [15, 30], unit: 's' }), 'en').map((o) => o.label)).toEqual(['15 s', '30 s']);
  });
  it('prefers the phone language when the app knows the label, else the player label', () => {
    expect(localizedLabel('en', 'Sound', 'Ton')).toBe('Sound');
    expect(localizedLabel('es', 'Sound', 'Ton')).toBe('Sonido');
    expect(localizedLabel('es', 'Unheard Of Label', 'Etiqueta del reproductor')).toBe('Etiqueta del reproductor');
  });
  it('lists groups that have something to show and summarises them', () => {
    expect(visibleGroups(schema).map((g) => g.id)).toEqual(['sound', 'display', 'library']);
    expect(groupSummary(schema, 'sound', { a: 80, g: true, c: false }, 'en', t)).toBe('Max Volume 80% · Gapless On');
    expect(groupIcon('sound')).toBe('volume');
    expect(groupIcon('whatever')).toBe('settings');
  });
  it('flags a setting whose dependency is off', () => {
    expect(unmetDependency(find('c'), schema, { g: false })?.key).toBe('g');
    expect(unmetDependency(find('c'), schema, { g: true })).toBeNull();
  });
  it('words badges and notices for delayed apply', () => {
    expect(applyBadge('live')).toBeNull();
    expect(applyBadge('next_track')).toBe('Next track');
    expect(savedNotice('next_boot')).toBe('Saved. Applies after the player restarts.');
    expect(savedNotice(null)).toBe('Saved on the player');
  });
  it('words every outcome of a change', () => {
    expect(noticeText({ kind: 'conflict' }, t)).toMatch(/changed on the player/);
    expect(noticeText({ kind: 'switch_off' }, t)).toMatch(/turned off/);
    expect(noticeText({ kind: 'failed', error: 'player_busy' }, t)).toMatch(/busy/);
    expect(noticeText({ kind: 'failed', error: 'unknown' }, t)).toMatch(/Couldn’t save/);
    expect(noticeText({ kind: 'rescan_running' }, t)).toMatch(/already running/);
  });
});
