import React from 'react';
import { StyleSheet, View } from 'react-native';
import { usePalette } from '../PaletteProvider';
import { Space } from '../tokens';
import { AppText } from './AppText';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { useI18n } from '../../i18n';
import { localizedCountLabel } from '../localizedLabels';

export interface LibraryToolbarProps {
  countLabel: string;
  ascending?: boolean;
  onToggleSort?: () => void;
  grid?: boolean;
  onToggleGrid?: () => void;
  insetRight?: number;
}

const TOOLBAR_ICON_SIZE = 18;

export function LibraryToolbar({
  countLabel,
  ascending,
  onToggleSort,
  grid,
  onToggleGrid,
  insetRight,
}: LibraryToolbarProps) {
  const palette = usePalette();
  const { t } = useI18n();
  return (
    <View style={[styles.row, insetRight != null && { paddingRight: insetRight }]}>
      <AppText variant="caption" tone="inkMuted" numberOfLines={1} style={styles.count}>
        {localizedCountLabel(countLabel, t)}
      </AppText>
      {onToggleSort ? (
        <Button
          label={t(ascending ? 'A–Z' : 'Z–A')}
          accessibilityLabel={t(ascending ? 'Sort order: A to Z' : 'Sort order: Z to A')}
          icon="sort"
          variant="plain"
          size="sm"
          onPress={onToggleSort}
        />
      ) : null}
      {onToggleGrid ? (
        <IconButton
          icon={grid ? 'listView' : 'grid'}
          label={t(grid ? 'Show as list' : 'Show as grid')}
          size="sm"
          iconSize={TOOLBAR_ICON_SIZE}
          color={palette.ink}
          onPress={onToggleGrid}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingTop: Space.sm,
    paddingLeft: Space.lg,
    paddingRight: Space.sm,
  },
  count: {
    flex: 1,
  },
});
