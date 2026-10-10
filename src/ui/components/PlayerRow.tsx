import React, { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { usePalette } from '../PaletteProvider';
import { Space } from '../tokens';
import { Icon } from './Icon';
import { ListRow } from './ListRow';

export interface PlayerRowProps {
  name: string;
  detail: string;
  selected: boolean;
  onPress: () => void;
  trailing?: ReactNode;
}

export function PlayerRow({ name, detail, selected, onPress, trailing }: PlayerRowProps) {
  const palette = usePalette();
  const end = trailing ?? (selected ? <Icon name="check" color={palette.accent} /> : null);

  return (
    <ListRow
      title={name}
      subtitle={detail}
      subtitleTabular
      selected={selected}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={`${name}, ${detail}`}
      leading={<Icon name="player" />}
      trailing={end ? <View style={styles.trailing}>{end}</View> : undefined}
    />
  );
}

const styles = StyleSheet.create({
  trailing: {
    paddingRight: Space.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
});
