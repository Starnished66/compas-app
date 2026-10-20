import React from 'react';
import { ACCENT_STYLE_HINTS, ACCENT_STYLE_LABELS, ACCENT_STYLES, AccentStyle } from '../accentStyle';
import { useAccentPreference } from '../preferences/useAccentPreference';
import { PreferenceSetting } from './PreferenceSetting';
import { SegmentedOption } from './SegmentedControl';
import { useI18n } from '../../i18n';

const OPTIONS: ReadonlyArray<SegmentedOption<AccentStyle>> = ACCENT_STYLES.map((value) => ({
  value,
  label: ACCENT_STYLE_LABELS[value],
}));

export function AccentSetting() {
  const { t } = useI18n();
  const { preference, setPreference } = useAccentPreference();
  return (
    <PreferenceSetting
      title={t('Accent color')}
      options={OPTIONS.map((option) => ({ ...option, label: t(option.label) }))}
      hints={Object.fromEntries(Object.entries(ACCENT_STYLE_HINTS).map(([key, value]) => [key, t(value)])) as typeof ACCENT_STYLE_HINTS}
      value={preference}
      onChange={setPreference}
    />
  );
}
