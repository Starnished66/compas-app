import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { usePalette } from '../PaletteProvider';
import { RailLetter } from '../library/alphabetIndex';
import { AppText } from './AppText';

export interface AlphabetRailProps {
  letters: RailLetter[];
  top: number;
  bottom: number;
  onSelect: (itemIndex: number) => void;
}

const RAIL_RIGHT = 2;
const LETTER_WIDTH = 24;
const LETTER_HEIGHT = 18;
const LETTER_HIT_SLOP = { left: 8, right: 2 };

export function AlphabetRail({ letters, top, bottom, onSelect }: AlphabetRailProps) {
  const palette = usePalette();
  if (!letters.length) return null;
  return (
    <View pointerEvents="box-none" style={[styles.rail, { top, bottom }]}>
      {letters.map(({ letter, itemIndex }) => (
        <Pressable
          key={letter}
          accessibilityRole="button"
          accessibilityLabel={`Jump to ${letter}`}
          hitSlop={LETTER_HIT_SLOP}
          onPress={() => onSelect(itemIndex)}
          style={({ pressed }) => [styles.letter, pressed && { backgroundColor: palette.surfaceRaised }]}
        >
          <AppText variant="micro" tone="inkMuted" style={styles.letterText}>
            {letter}
          </AppText>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    position: 'absolute',
    right: RAIL_RIGHT,
    justifyContent: 'center',
  },
  letter: {
    width: LETTER_WIDTH,
    height: LETTER_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: LETTER_HEIGHT / 2,
  },
  letterText: {
    fontWeight: '600',
  },
});
