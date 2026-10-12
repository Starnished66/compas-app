import React from 'react';
import {
  BACKGROUND_STYLE_HINTS,
  BACKGROUND_STYLE_LABELS,
  BACKGROUND_STYLES,
  BackgroundStyle,
} from '../backgroundStyle';
import { useBackgroundPreference } from '../preferences/useBackgroundPreference';
import { PreferenceSetting } from './PreferenceSetting';
import { SegmentedOption } from './SegmentedControl';

const OPTIONS: ReadonlyArray<SegmentedOption<BackgroundStyle>> = BACKGROUND_STYLES.map((value) => ({
  value,
  label: BACKGROUND_STYLE_LABELS[value],
}));

export function BackgroundSetting() {
  const { preference, setPreference } = useBackgroundPreference();
  return (
    <PreferenceSetting
      title="Background"
      options={OPTIONS}
      hints={BACKGROUND_STYLE_HINTS}
      value={preference}
      onChange={setPreference}
    />
  );
}
