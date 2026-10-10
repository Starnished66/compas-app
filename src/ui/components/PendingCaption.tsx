import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Space } from '../tokens';
import { AppText } from './AppText';
import { Spinner } from './Spinner';

export interface PendingCaptionProps {
  label: string | null;
}

const SPINNER_SIZE = 12;

export function PendingCaption({ label }: PendingCaptionProps) {
  return (
    <View style={styles.row} accessibilityLiveRegion="polite">
      {label ? (
        <>
          <Spinner size={SPINNER_SIZE} />
          <AppText variant="caption" tone="inkMuted" numberOfLines={1} style={styles.label}>
            {label}
          </AppText>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
  },
  label: {
    flexShrink: 1,
  },
});
