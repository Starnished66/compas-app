import React from 'react';
import { StyleSheet, View } from 'react-native';
import {
  MINI_PROGRESS_HINTS,
  MINI_PROGRESS_LABELS,
  MINI_PROGRESS_PREFERENCES,
  MiniProgressPreference,
} from '../miniProgress';
import { useMiniProgressPreference } from '../preferences/useMiniProgressPreference';
import { Space } from '../tokens';
import { AppText } from './AppText';
import { SegmentedControl, SegmentedOption } from './SegmentedControl';

const OPTIONS: ReadonlyArray<SegmentedOption<MiniProgressPreference>> = MINI_PROGRESS_PREFERENCES.map((value) => ({
  value,
  label: MINI_PROGRESS_LABELS[value],
}));

export function MiniProgressSetting() {
  const { preference, setPreference } = useMiniProgressPreference();
  return (
    <View style={styles.container}>
      <AppText variant="body">Mini player progress</AppText>
      <SegmentedControl label="Mini player progress" options={OPTIONS} value={preference} onChange={setPreference} />
      <AppText variant="caption" tone="inkMuted">
        {MINI_PROGRESS_HINTS[preference]}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Space.sm,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
  },
});
