import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SettingDescriptor, SettingsSchema, SettingValue, SettingValues } from '../../../core/settingsModels';
import { useI18n } from '../../../i18n';
import { AppText } from '../AppText';
import { Icon } from '../Icon';
import { ListRow } from '../ListRow';
import { SegmentedControl } from '../SegmentedControl';
import { Slider } from '../Slider';
import { Toggle } from '../Toggle';
import { Space } from '../../tokens';
import {
  applyBadge,
  choiceOptions,
  controlKindFor,
  formatNumber,
  formatSettingValue,
  localizedLabel,
  sliderToValue,
  unmetDependency,
  valueToSlider,
} from './settingsPresentation';

export interface SettingControlProps {
  setting: SettingDescriptor;
  schema: SettingsSchema;
  values: SettingValues;
  /** False if the player reports its settings as read-only: values show but cannot change. */
  writable: boolean;
  busy: boolean;
  /** Set when the player stored the value but applies it later. */
  pendingApply?: string;
  onChange: (setting: SettingDescriptor, value: SettingValue) => void;
}

/** One setting drawn from its schema entry. The control follows the entry's type, never its key. */
export function SettingControl({ setting, schema, values, writable, busy, pendingApply, onChange }: SettingControlProps) {
  const { t, language } = useI18n();
  const [open, setOpen] = useState(false);
  const kind = controlKindFor(setting);
  const value = values[setting.key];
  const title = localizedLabel(language, setting.labelId, setting.label);
  const unmet = unmetDependency(setting, schema, values);
  const disabled = !writable || busy || unmet != null;
  const badge = applyBadge(setting.apply);
  const hint = unmet ? t('Needs {name} on', { name: localizedLabel(language, unmet.labelId, unmet.label) }) : badge ? t(badge) : undefined;

  if (kind === 'hidden') return null;

  const view = { setting, value, title, language, t, hint, disabled, onChange, open, setOpen, badge, pendingApply };
  if (kind === 'locked') return renderLockedSetting(view);
  if (kind === 'toggle') return renderToggleSetting(view);
  if (kind === 'segmented') return renderSegmentedSetting(view);
  if (kind === 'choice') return renderChoiceSetting(view);
  return renderNumericSetting(view);
}

type I18n = ReturnType<typeof useI18n>;

interface SettingView extends Pick<SettingControlProps, 'setting' | 'onChange' | 'pendingApply'> {
  value: SettingValues[string];
  title: string;
  language: I18n['language'];
  t: I18n['t'];
  hint: string | undefined;
  disabled: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
  badge: ReturnType<typeof applyBadge>;
}


function renderLockedSetting({ setting, value, language, t, title }: SettingView) {
  const shown = formatSettingValue(setting, value, language, t);
  return (
    <ListRow
      title={title}
      titleTone="inkMuted"
      subtitle={shown ? `${shown} · ${t('Change it on the player')}` : t('Change it on the player')}
    />
  );
}

function renderToggleSetting({ setting, value, title, hint, disabled, onChange }: SettingView) {
  return (
    <ListRow
      title={title}
      subtitle={hint}
      trailing={<Toggle value={value === true} label={title} disabled={disabled} onChange={(next) => onChange(setting, next)} />}
      onPress={disabled ? undefined : () => onChange(setting, value !== true)}
      accessibilityRole="switch"
      accessibilityLabel={title}
      disabled={disabled}
    />
  );
}

function renderSegmentedSetting({ setting, value, title, hint, disabled, onChange, language }: SettingView) {
  const options = choiceOptions(setting, language);
  return (
    <View style={[styles.block, disabled && styles.dim]}>
      <View style={styles.titleRow}>
        <AppText variant="body">{title}</AppText>
        {hint ? <AppText variant="caption" tone="inkMuted">{hint}</AppText> : null}
      </View>
      <SegmentedControl
        label={title}
        options={options.map((o) => ({ value: String(o.value), label: o.label }))}
        value={String(value)}
        disabled={disabled}
        onChange={(next) => onChange(setting, Number(next))}
      />
    </View>
  );
}

function renderChoiceSetting({ setting, value, title, hint, disabled, onChange, language, t, open, setOpen }: SettingView) {
  const options = choiceOptions(setting, language);
  return (
    <>
      <ListRow
        title={title}
        subtitle={[formatSettingValue(setting, value, language, t), hint].filter(Boolean).join(' · ')}
        trailing={<Icon name={open ? 'chevronUp' : 'chevronDown'} size={18} />}
        onPress={disabled ? undefined : () => setOpen(!open)}
        disabled={disabled}
        expanded={open}
      />
      {open ? options.map((option) => (
        <ListRow
          key={option.value}
          variant="action"
          title={option.label}
          selected={value === option.value}
          accessibilityRole="radio"
          disabled={disabled}
          trailing={value === option.value ? <Icon name="check" /> : null}
          onPress={() => {
            setOpen(false);
            if (value !== option.value) onChange(setting, option.value);
          }}
        />
      )) : null}
    </>
  );
}

function renderNumericSetting({ setting, value, title, disabled, onChange, t, pendingApply, badge }: SettingView) {
  const known = typeof value === 'number';
  const numeric = known ? value : (setting.min ?? 0);
  return (
    <View style={[styles.block, (disabled || !known) && styles.dim]}>
      <View style={styles.titleRow}>
        <AppText variant="body" tone="inkMuted" style={styles.grow}>{title}</AppText>
        <AppText variant="body" tone="inkMuted" tabular>{known ? formatNumber(numeric, setting.unit) : '–'}</AppText>
      </View>
      <Slider
        label={title}
        value={valueToSlider(setting, numeric)}
        disabled={disabled || !known}
        formatValue={(unit) => formatNumber(sliderToValue(setting, unit), setting.unit)}
        onCommit={(unit) => {
          const next = sliderToValue(setting, unit);
          if (next !== numeric) onChange(setting, next);
        }}
      />
      {setting.confirmAbove != null ? (
        <AppText variant="caption" tone="inkMuted">
          {t('Above {level}% shows the loud-volume warning', { level: setting.confirmAbove })}
        </AppText>
      ) : null}
      {pendingApply && badge ? <AppText variant="caption" tone="inkMuted">{t(badge)}</AppText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: Space.sm, paddingHorizontal: Space.lg, paddingVertical: Space.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  grow: { flex: 1 },
  dim: { opacity: 0.6 },
});
