import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Space } from '../tokens';
import { Chip } from './Chip';

export interface CategoryChipOption<T extends string> {
  value: T;
  label: string;
}

export interface CategoryChipsProps<T extends string> {
  options: CategoryChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function CategoryChips<T extends string>({ options, value, onChange }: CategoryChipsProps<T>) {
  return (
    <View style={styles.frame}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        accessibilityRole="tablist"
      >
        {options.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            selected={option.value === value}
            onPress={() => onChange(option.value)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    paddingVertical: Space.sm,
  },
  row: {
    gap: Space.sm,
    paddingHorizontal: Space.lg,
  },
});
