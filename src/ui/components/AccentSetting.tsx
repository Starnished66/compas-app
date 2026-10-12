import React from 'react';
import { ACCENT_STYLE_HINTS, ACCENT_STYLE_LABELS, ACCENT_STYLES, AccentStyle } from '../accentStyle';
import { useAccentPreference } from '../preferences/useAccentPreference';
import { PreferenceSetting } from './PreferenceSetting';
import { SegmentedOption } from './SegmentedControl';

const OPTIONS: ReadonlyArray<SegmentedOption<AccentStyle>> = ACCENT_STYLES.map((value) => ({
  value,
  label: ACCENT_STYLE_LABELS[value],
}));

export function AccentSetting() {
  const { preference, setPreference } = useAccentPreference();
  return (
    <PreferenceSetting
      title="Accent color"
      options={OPTIONS}
      hints={ACCENT_STYLE_HINTS}
      value={preference}
      onChange={setPreference}
    />
  );
}
