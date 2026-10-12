import React from 'react';
import {
  MINI_PROGRESS_HINTS,
  MINI_PROGRESS_LABELS,
  MINI_PROGRESS_PREFERENCES,
  MiniProgressPreference,
} from '../miniProgress';
import { useMiniProgressPreference } from '../preferences/useMiniProgressPreference';
import { PreferenceSetting } from './PreferenceSetting';
import { SegmentedOption } from './SegmentedControl';

const OPTIONS: ReadonlyArray<SegmentedOption<MiniProgressPreference>> = MINI_PROGRESS_PREFERENCES.map((value) => ({
  value,
  label: MINI_PROGRESS_LABELS[value],
}));

export function MiniProgressSetting() {
  const { preference, setPreference } = useMiniProgressPreference();
  return (
    <PreferenceSetting
      title="Mini player progress"
      options={OPTIONS}
      hints={MINI_PROGRESS_HINTS}
      value={preference}
      onChange={setPreference}
    />
  );
}
