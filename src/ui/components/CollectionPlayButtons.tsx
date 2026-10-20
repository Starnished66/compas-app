import React from 'react';
import { Button } from './Button';
import { useI18n } from '../../i18n';

export interface CollectionPlayButtonsProps {
  onPlay: () => void;
  onShuffle: () => void;
  busy?: boolean;
}

export function CollectionPlayButtons({ onPlay, onShuffle, busy = false }: CollectionPlayButtonsProps) {
  const { t } = useI18n();
  return (
    <>
      <Button label={t('Play')} icon="play" variant="accent" fill onPress={onPlay} busy={busy} />
      <Button label={t('Shuffle')} icon="shuffle" variant="container" fill onPress={onShuffle} disabled={busy} />
    </>
  );
}
