import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Space } from '../tokens';
import { AppText } from './AppText';
import { SegmentedControl, SegmentedOption } from './SegmentedControl';

export interface PreferenceSettingProps<T extends string> {
  title: string;
  options: ReadonlyArray<SegmentedOption<T>>;
  hints?: Record<T, string>;
  value: T;
  onChange: (value: T) => void;
}

export function PreferenceSetting<T extends string>({ title, options, hints, value, onChange }: PreferenceSettingProps<T>) {
  return (
    <View style={styles.container}>
      <AppText variant="body">{title}</AppText>
      <SegmentedControl label={title} options={options} value={value} onChange={onChange} />
      {hints ? (
        <AppText variant="caption" tone="inkMuted">
          {hints[value]}
        </AppText>
      ) : null}
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
