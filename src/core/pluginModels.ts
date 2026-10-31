/** Types and strict response parsers for the player's plugin management API. */

export type StoreState = 'idle' | 'refreshing' | 'installing' | 'updating' | 'updating_all' | 'uninstalling' | 'ready' | 'needs_confirm' | 'failed';
export type StorePluginState = 'available' | 'installed' | 'update' | 'manual' | 'incompatible' | 'removed';
export type PlayerLayoutSource = 'builtin_c' | 'exported_c' | 'xml_file';

export interface StorePlugin {
  id: string;
  name: string;
  version: string;
  state: StorePluginState;
  incompatible: boolean;
  needs_confirmation: boolean;
  player_layout: boolean;
  theme_pack: boolean;
  description: string;
  category: string;
  author: string;
  size: number;
}

export interface StoreSnapshot {
  state: StoreState;
  percent: number;
  current_plugin: string;
  error: string | null;
  changed: boolean;
  refresh_required: boolean;
  confirmation_required: boolean;
  offset: number;
  limit: number;
  total: number;
  plugins: StorePlugin[];
}

export interface InstalledPlugin {
  id: string;
  name: string;
  enabled: boolean;
  loaded: boolean;
  error: string | null;
  player_layout: boolean;
  theme_package: boolean;
  can_open_settings?: boolean;
}

export interface InstalledSnapshot {
  offset: number;
  limit: number;
  total: number;
  truncated: boolean;
  refresh_pending: boolean;
  plugins: InstalledPlugin[];
}

export interface PlayerLayout {
  id: string;
  name: string;
  source: PlayerLayoutSource;
  has_preview: boolean;
}

export interface LayoutSnapshot {
  current: string;
  offset: number;
  limit: number;
  total: number;
  layouts: PlayerLayout[];
}

export interface ActionResult {
  accepted: boolean;
  current?: StoreSnapshot | string;
  refresh_requested?: boolean;
  state?: StoreState;
  percent?: number;
  current_plugin?: string;
  error?: string | null;
  changed?: boolean;
  refresh_required?: boolean;
  confirmation_required?: boolean;
  offset?: number;
  limit?: number;
  total?: number;
  plugins?: StorePlugin[];
}

export class PluginResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PluginResponseError';
  }
}

function object(value: unknown, label: string): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PluginResponseError(`Invalid ${label} response`);
  return value as Record<string, any>;
}
function string(value: unknown, field: string, max = 4096): string {
  if (typeof value !== 'string' || new TextEncoder().encode(value).byteLength > max) throw new PluginResponseError(`Invalid plugin response field '${field}'`);
  return value;
}
function nullableString(value: unknown, field: string): string | null {
  return value === null ? null : string(value, field, 512);
}
function bool(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new PluginResponseError(`Invalid plugin response field '${field}'`);
  return value;
}
function integer(value: unknown, field: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new PluginResponseError(`Invalid plugin response field '${field}'`);
  }
  return value;
}
function enumValue<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) throw new PluginResponseError(`Invalid plugin response field '${field}'`);
  return value as T;
}
function paged(value: unknown, arrayKey: string, expectedOffset?: number, expectedLimit?: number): { raw: Record<string, any>; offset: number; limit: number; total: number; items: any[] } {
  const raw = object(value, 'paged');
  const offset = integer(raw.offset, 'offset');
  const limit = integer(raw.limit, 'limit', 0, 200);
  const total = integer(raw.total, 'total');
  if (!Array.isArray(raw[arrayKey]) || raw[arrayKey].length > limit || offset > total || offset + raw[arrayKey].length > total ||
      (expectedOffset !== undefined && offset !== expectedOffset) || (expectedLimit !== undefined && limit !== expectedLimit)) {
    throw new PluginResponseError('Invalid plugin pagination response');
  }
  return { raw, offset, limit, total, items: raw[arrayKey] };
}

export function parseStorePlugin(value: unknown): StorePlugin {
  const p = object(value, 'store plugin');
  return {
    id: string(p.id, 'id', 127), name: string(p.name, 'name', 256), version: string(p.version, 'version', 128),
    state: enumValue(p.state, ['available', 'installed', 'update', 'manual', 'incompatible', 'removed'], 'state'),
    incompatible: bool(p.incompatible, 'incompatible'), needs_confirmation: bool(p.needs_confirmation, 'needs_confirmation'),
    player_layout: bool(p.player_layout, 'player_layout'), theme_pack: bool(p.theme_pack, 'theme_pack'),
    description: string(p.description, 'description'), category: string(p.category, 'category', 128), author: string(p.author, 'author', 256),
    size: integer(p.size, 'size'),
  };
}

export function parseStoreSnapshot(value: unknown, expectedOffset?: number, expectedLimit?: number): StoreSnapshot {
  const page = paged(value, 'plugins', expectedOffset, expectedLimit);
  const p = page.raw;
  return {
    state: enumValue(p.state, ['idle', 'refreshing', 'installing', 'updating', 'updating_all', 'uninstalling', 'ready', 'needs_confirm', 'failed'], 'state'),
    percent: integer(p.percent, 'percent', 0, 100), current_plugin: string(p.current_plugin, 'current_plugin', 127),
    error: nullableString(p.error, 'error'), changed: bool(p.changed, 'changed'), refresh_required: bool(p.refresh_required, 'refresh_required'),
    confirmation_required: bool(p.confirmation_required, 'confirmation_required'), offset: page.offset, limit: page.limit, total: page.total,
    plugins: page.items.map(parseStorePlugin),
  };
}

export function parseInstalledSnapshot(value: unknown, expectedOffset?: number, expectedLimit?: number): InstalledSnapshot {
  const page = paged(value, 'plugins', expectedOffset, expectedLimit);
  return {
    offset: page.offset, limit: page.limit, total: page.total,
    truncated: bool(page.raw.truncated, 'truncated'), refresh_pending: bool(page.raw.refresh_pending, 'refresh_pending'),
    plugins: page.items.map((value: unknown) => {
      const p = object(value, 'installed plugin');
      return { id: string(p.id, 'id', 255), name: string(p.name, 'name', 256), enabled: bool(p.enabled, 'enabled'),
        loaded: bool(p.loaded, 'loaded'), error: nullableString(p.error, 'error'), player_layout: bool(p.player_layout, 'player_layout'),
        theme_package: bool(p.theme_package, 'theme_package'),
        can_open_settings: p.can_open_settings === undefined ? false : bool(p.can_open_settings, 'can_open_settings') };
    }),
  };
}

export function parseLayoutSnapshot(value: unknown, expectedOffset?: number, expectedLimit?: number): LayoutSnapshot {
  const page = paged(value, 'layouts', expectedOffset, expectedLimit);
  return { current: string(page.raw.current, 'current', 63), offset: page.offset, limit: page.limit, total: page.total,
    layouts: page.items.map((value: unknown) => {
      const p = object(value, 'layout');
      return { id: string(p.id, 'id', 63), name: string(p.name, 'name', 256),
        source: enumValue(p.source, ['builtin_c', 'exported_c', 'xml_file'], 'source'), has_preview: bool(p.has_preview, 'has_preview') };
    }) };
}
