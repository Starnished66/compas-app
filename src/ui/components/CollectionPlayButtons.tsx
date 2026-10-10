import React from 'react';
import { Button } from './Button';

export interface CollectionPlayButtonsProps {
  onPlay: () => void;
  onShuffle: () => void;
}

export function CollectionPlayButtons({ onPlay, onShuffle }: CollectionPlayButtonsProps) {
  return (
    <>
      <Button label="Play" icon="play" variant="accent" fill onPress={onPlay} />
      <Button label="Shuffle" icon="shuffle" variant="container" fill onPress={onShuffle} />
    </>
  );
}
