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
import { useI18n } from '../../i18n';

const OPTIONS: ReadonlyArray<SegmentedOption<MiniProgressPreference>> = MINI_PROGRESS_PREFERENCES.map((value) => ({
  value,
  label: MINI_PROGRESS_LABELS[value],
}));

export function MiniProgressSetting() {
  const { t } = useI18n();
  const { preference, setPreference } = useMiniProgressPreference();
  return (
    <PreferenceSetting
      title={t('Mini player progress')}
      options={OPTIONS.map((option) => ({ ...option, label: t(option.label) }))}
      hints={Object.fromEntries(Object.entries(MINI_PROGRESS_HINTS).map(([key, value]) => [key, t(value)])) as typeof MINI_PROGRESS_HINTS}
      value={preference}
      onChange={setPreference}
    />
  );
}
