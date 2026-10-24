import React from 'react';
import { StyleSheet } from 'react-native';
import { AppText } from './AppText';
import { Button } from './Button';
import { useI18n } from '../../i18n';

export interface PlaylistEditBarProps {
  onDone: () => void;
}

export function PlaylistEditBar({ onDone }: PlaylistEditBarProps) {
  const { t } = useI18n();
  return (
    <>
      <AppText variant="caption" tone="inkMuted" style={styles.hint}>
        {t('Drag ≡ to reorder. Changes save to the player as you go.')}
      </AppText>
      <Button label={t('Done')} variant="accent" onPress={onDone} />
    </>
  );
}

const styles = StyleSheet.create({
  hint: {
    flex: 1,
  },
});
