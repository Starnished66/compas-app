import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Space } from '../tokens';
import { AppText } from './AppText';

export interface SheetStepTitleProps {
  title: string;
  caption?: string;
  style?: StyleProp<ViewStyle>;
}

export function SheetStepTitle({ title, caption, style }: SheetStepTitleProps) {
  return (
    <View style={[styles.header, style]}>
      <AppText variant="title" accessibilityRole="header">
        {title}
      </AppText>
      {caption ? (
        <AppText variant="caption" tone="inkMuted">
          {caption}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: Space.xs,
    paddingHorizontal: Space.lg,
    paddingBottom: Space.sm,
  },
});
