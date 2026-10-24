import React from 'react';
import { StyleSheet, View } from 'react-native';
import { usePalette } from '../PaletteProvider';
import { Radius, Size } from '../tokens';
import { Icon } from './Icon';
import { ListRow } from './ListRow';
import { useI18n } from '../../i18n';

export interface NewPlaylistRowProps {
  subtitle: string;
  onPress: () => void;
}

const PLUS_ICON_SIZE = 20;

export function NewPlaylistRow({ subtitle, onPress }: NewPlaylistRowProps) {
  const { t } = useI18n();
  const palette = usePalette();
  return (
    <ListRow
      title={t('New playlist')}
      subtitle={subtitle}
      onPress={onPress}
      leading={
        <View style={[styles.badge, { backgroundColor: palette.accentContainer }]}>
          <Icon name="plus" size={PLUS_ICON_SIZE} color={palette.onAccentContainer} />
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  badge: {
    width: Size.rowArtwork,
    height: Size.rowArtwork,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
