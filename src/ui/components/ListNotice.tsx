import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Space } from '../tokens';
import { AppText } from './AppText';

export interface ListNoticeProps {
  title: string;
  body: string;
}

export function ListNotice({ title, body }: ListNoticeProps) {
  return (
    <View accessible style={styles.notice}>
      <AppText variant="bodyStrong">{title}</AppText>
      <AppText variant="caption" tone="inkMuted">
        {body}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    paddingHorizontal: Space.lg,
    paddingTop: Space.sm,
    paddingBottom: Space.md,
    gap: Space.xs,
  },
});
