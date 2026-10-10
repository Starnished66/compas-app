import React from 'react';
import { StyleSheet } from 'react-native';
import { AppText } from './AppText';
import { Button } from './Button';

export interface PlaylistEditBarProps {
  onDone: () => void;
}

export function PlaylistEditBar({ onDone }: PlaylistEditBarProps) {
  return (
    <>
      <AppText variant="caption" tone="inkMuted" style={styles.hint}>
        Drag ≡ to reorder. Changes save to the player as you go.
      </AppText>
      <Button label="Done" variant="accent" onPress={onDone} />
    </>
  );
}

const styles = StyleSheet.create({
  hint: {
    flex: 1,
  },
});
