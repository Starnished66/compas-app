import { catalogs, Language } from '../../../i18n/catalogs';
import {
  SettingApply,
  SettingDescriptor,
  SettingGroup,
  SettingsSchema,
  SettingValue,
  SettingValues,
} from '../../../core/settingsModels';
import type { PlayerSettingsNotice } from '../../../session/PlayerSettingsController';
import { IconName } from '../iconPaths';

export type SettingControlKind = 'hidden' | 'locked' | 'toggle' | 'segmented' | 'choice' | 'slider';

const SEGMENT_LIMIT = 4;

/** Which control draws this setting. Pure so every type can be tested without rendering. */
export function controlKindFor(setting: SettingDescriptor): SettingControlKind {
  if (!setting.available) return 'hidden';
  if (setting.readOnly || setting.type === 'string') return 'locked';
  switch (setting.type) {
    case 'bool':
      return 'toggle';
    case 'enum':
      if (setting.options.length === 0) return 'hidden';
      return setting.options.length <= SEGMENT_LIMIT ? 'segmented' : 'choice';
    case 'preset':
      if (setting.values.length === 0) return 'hidden';
      return setting.values.length <= SEGMENT_LIMIT ? 'segmented' : 'choice';
    case 'int':
    case 'percent':
      return setting.min != null && setting.max != null && setting.max > setting.min ? 'slider' : 'hidden';
  }
}

export interface ChoiceOption {
  value: number;
  label: string;
}

/** The options of an enum or preset setting as label and value pairs. */
export function choiceOptions(setting: SettingDescriptor, language: Language): ChoiceOption[] {
  if (setting.type === 'enum') {
    return setting.options.map((o) => ({ value: o.value, label: localizedLabel(language, o.labelId, o.label) }));
  }
  return setting.values.map((value) => ({ value, label: formatNumber(value, setting.unit) }));
}

export function formatNumber(value: number, unit: string | null): string {
  if (!unit) return String(value);
  return unit === '%' ? `${value}%` : `${value} ${unit}`;
}

/** The player sends labels in its own language and the English text as labelId; prefer the phone's language when the app knows it. */
export function localizedLabel(language: Language, labelId: string, playerLabel: string): string {
  if (language === 'en') return labelId;
  const known = catalogs[language][labelId];
  return typeof known === 'string' ? known : playerLabel;
}

/** Short text for a setting's current value, for summaries and the choice list. */
export function formatSettingValue(
  setting: SettingDescriptor,
  value: SettingValue | undefined,
  language: Language,
  t: (source: string) => string,
): string {
  if (value === undefined) return '';
  if (typeof value === 'boolean') return t(value ? 'On' : 'Off');
  if (typeof value === 'string') return value;
  if (setting.type === 'enum') {
    const option = setting.options.find((o) => o.value === value);
    return option ? localizedLabel(language, option.labelId, option.label) : String(value);
  }
  return formatNumber(value, setting.unit);
}

/** Settings of one group that get a control or a locked row, in the player's order. */
export function visibleSettings(schema: SettingsSchema, groupId: string): SettingDescriptor[] {
  return schema.settings.filter((s) => s.group === groupId && controlKindFor(s) !== 'hidden');
}

/** Groups that have something to show, so an empty group never appears. */
export function visibleGroups(schema: SettingsSchema): SettingGroup[] {
  return schema.groups.filter((g) => visibleSettings(schema, g.id).length > 0 || schema.actions.some((a) => a.group === g.id));
}

/** "Max Volume 80% · Gapless On" for the group list: the first two writable settings. */
export function groupSummary(
  schema: SettingsSchema,
  groupId: string,
  values: SettingValues,
  language: Language,
  t: (source: string) => string,
): string {
  return visibleSettings(schema, groupId)
    .filter((s) => controlKindFor(s) !== 'locked' && values[s.key] !== undefined)
    .slice(0, 2)
    .map((s) => `${localizedLabel(language, s.labelId, s.label)} ${formatSettingValue(s, values[s.key], language, t)}`)
    .join(' · ');
}

export function groupIcon(groupId: string): IconName {
  switch (groupId) {
    case 'sound': return 'volume';
    case 'display': return 'playerScreen';
    case 'power': return 'power';
    case 'playback': return 'music';
    case 'connections': return 'bluetooth';
    case 'library': return 'library';
    default: return 'settings';
  }
}

export function applyBadge(apply: SettingApply): string | null {
  switch (apply) {
    case 'next_track': return 'Next track';
    case 'next_use': return 'Next use';
    case 'next_boot': return 'After restart';
    default: return null;
  }
}

export function savedNotice(apply: string | null): string {
  switch (apply) {
    case 'next_track': return 'Saved. Applies from the next track.';
    case 'next_use': return 'Saved. Applies the next time it is used.';
    case 'next_boot': return 'Saved. Applies after the player restarts.';
    default: return 'Saved on the player';
  }
}

/** A setting that depends on another one (Crossfade needs Gapless) is unusable while that one is off. */
export function unmetDependency(setting: SettingDescriptor, schema: SettingsSchema, values: SettingValues): SettingDescriptor | null {
  if (!setting.dependsOn || values[setting.dependsOn] !== false) return null;
  return schema.settings.find((s) => s.key === setting.dependsOn) ?? null;
}

/** Slider position (0..1) to the whole number it stands for. */
export function sliderToValue(setting: SettingDescriptor, unit: number): number {
  const min = setting.min ?? 0;
  const max = setting.max ?? 100;
  return Math.round(min + Math.max(0, Math.min(1, unit)) * (max - min));
}

export function valueToSlider(setting: SettingDescriptor, value: number): number {
  const min = setting.min ?? 0;
  const max = setting.max ?? 100;
  return max > min ? (Math.max(min, Math.min(max, value)) - min) / (max - min) : 0;
}

/** The snackbar text for an outcome, or null for none. Exported for tests. */
export function noticeText(notice: PlayerSettingsNotice, t: (source: string) => string): string | null {
  switch (notice.kind) {
    case 'saved': return t(savedNotice(notice.apply));
    case 'conflict': return t('This changed on the player. The list was reloaded; try again.');
    case 'rescan_started': return t('Music scan started on the player.');
    case 'rescan_running': return t('A music scan is already running.');
    case 'failed':
      if (notice.error === 'player_busy' || notice.error === 'busy') return t('The player is busy. Try again in a moment.');
      if (notice.error === 'pin_required') return t('The saved PIN was rejected. Enter the current PIN.');
      return t('Couldn’t save that setting.');
  }
}
