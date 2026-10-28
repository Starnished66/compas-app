/** Types and strict parsers for the player's remote settings API (schema version 1). */

export type SettingType = 'bool' | 'enum' | 'int' | 'percent' | 'preset' | 'string';
export type SettingApply = 'live' | 'next_track' | 'next_use' | 'next_boot';
export type SettingValue = boolean | number | string;
export type SettingValues = Record<string, SettingValue>;

export interface SettingOption {
  value: number;
  label: string;
  labelId: string;
}

export interface SettingDescriptor {
  key: string;
  group: string;
  label: string;
  labelId: string;
  type: SettingType;
  apply: SettingApply;
  available: boolean;
  readOnly: boolean;
  reason: string | null;
  min: number | null;
  max: number | null;
  unit: string | null;
  values: number[];
  options: SettingOption[];
  dependsOn: string | null;
  confirmAbove: number | null;
}

export interface SettingGroup {
  id: string;
  label: string;
  labelId: string;
}

export interface SettingAction {
  id: string;
  group: string;
  label: string;
  labelId: string;
}

export interface SettingsSchema {
  schemaVersion: number;
  device: { model: string | null; board: string | null; playerVersion: string | null };
  groups: SettingGroup[];
  settings: SettingDescriptor[];
  actions: SettingAction[];
}

export interface SettingsSnapshot {
  epoch: number;
  revision: number;
  full: boolean;
  writable: boolean;
  values: SettingValues;
}

export interface SettingsWriteResult {
  epoch: number;
  revision: number;
  applied: string[];
  pending: Array<{ key: string; reason: string }>;
  alsoChanged: string[];
}

export interface SettingsWriteRequest {
  changes: SettingValues;
  baseRevision?: number;
  epoch?: number;
  acknowledge?: string[];
}

const TYPES: readonly SettingType[] = ['bool', 'enum', 'int', 'percent', 'preset', 'string'];
const APPLIES: readonly SettingApply[] = ['live', 'next_track', 'next_use', 'next_boot'];

function str(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`Settings field '${field}' is invalid`);
  return value;
}

function optStr(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function optInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : null;
}

function int(value: unknown, field: string): number {
  const result = optInt(value);
  if (result == null) throw new Error(`Settings field '${field}' is invalid`);
  return result;
}

function parseDescriptor(raw: any): SettingDescriptor {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid setting entry');
  const type = raw.type;
  if (!TYPES.includes(type)) throw new Error(`Unknown setting type '${String(type)}'`);
  const labelId = str(raw.labelId ?? raw.label, 'labelId');
  return {
    key: str(raw.key, 'key'),
    group: str(raw.group, 'group'),
    label: str(raw.label ?? labelId, 'label'),
    labelId,
    type,
    apply: APPLIES.includes(raw.apply) ? raw.apply : 'live',
    available: raw.available !== false,
    readOnly: raw.readOnly === true || type === 'string',
    reason: optStr(raw.reason),
    min: optInt(raw.min),
    max: optInt(raw.max),
    unit: optStr(raw.unit),
    values: Array.isArray(raw.values) ? raw.values.filter((v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)) : [],
    options: Array.isArray(raw.options)
      ? raw.options.map((o: any) => ({ value: int(o?.value, 'option.value'), label: str(o?.label ?? o?.labelId, 'option.label'), labelId: str(o?.labelId ?? o?.label, 'option.labelId') }))
      : [],
    dependsOn: optStr(raw.dependsOn),
    confirmAbove: optInt(raw.confirmAbove),
  };
}

export function parseSchema(json: any): SettingsSchema {
  if (!json || typeof json !== 'object' || !Array.isArray(json.settings) || !Array.isArray(json.groups)) {
    throw new Error('Invalid settings schema response');
  }
  const device = json.device && typeof json.device === 'object' ? json.device : {};
  return {
    schemaVersion: int(json.schemaVersion, 'schemaVersion'),
    device: { model: optStr(device.model), board: optStr(device.board), playerVersion: optStr(device.playerVersion) },
    groups: json.groups.map((g: any) => ({ id: str(g?.id, 'group.id'), label: str(g?.label ?? g?.labelId ?? g?.id, 'group.label'), labelId: str(g?.labelId ?? g?.label ?? g?.id, 'group.labelId') })),
    settings: json.settings.map(parseDescriptor),
    actions: Array.isArray(json.actions)
      ? json.actions.map((a: any) => ({ id: str(a?.id, 'action.id'), group: str(a?.group, 'action.group'), label: str(a?.label ?? a?.labelId, 'action.label'), labelId: str(a?.labelId ?? a?.label, 'action.labelId') }))
      : [],
  };
}

export function parseValues(raw: unknown): SettingValues {
  const values: SettingValues = {};
  if (!raw || typeof raw !== 'object') return values;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'boolean' || typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))) values[key] = value;
  }
  return values;
}

export function parseSnapshot(json: any): SettingsSnapshot {
  if (!json || typeof json !== 'object') throw new Error('Invalid settings response');
  return {
    epoch: int(json.epoch, 'epoch'),
    revision: int(json.revision, 'revision'),
    full: json.full !== false,
    writable: json.writable === true,
    values: parseValues(json.values),
  };
}

export function parseWriteResult(json: any): SettingsWriteResult {
  if (!json || typeof json !== 'object') throw new Error('Invalid settings write response');
  return {
    epoch: int(json.epoch, 'epoch'),
    revision: int(json.revision, 'revision'),
    applied: Array.isArray(json.applied) ? json.applied.filter((k: unknown): k is string => typeof k === 'string') : [],
    pending: Array.isArray(json.pending)
      ? json.pending.filter((p: any) => p && typeof p.key === 'string').map((p: any) => ({ key: p.key, reason: typeof p.reason === 'string' ? p.reason : 'next_use' }))
      : [],
    alsoChanged: Array.isArray(json.alsoChanged) ? json.alsoChanged.filter((k: unknown): k is string => typeof k === 'string') : [],
  };
}
