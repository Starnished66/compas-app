import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { StorageRoot } from '../../../modules/compas-files/src';
import type { useI18n } from '../../i18n';
import { AppText } from '../components/AppText';
import { IconButton } from '../components/IconButton';
import { SegmentedControl } from '../components/SegmentedControl';
import { Space } from '../tokens';
import { storageRootLabel } from './useLocalDirectoryBrowser';

type Translate = ReturnType<typeof useI18n>['t'];

export interface LocalDirectoryHeaderProps {
  roots: readonly StorageRoot[];
  root: StorageRoot | null;
  displayPath: string;
  parentPath: string | null;
  loading: boolean;
  onSelectRoot: (rootPath: string) => void;
  onGoUp: (parentPath: string) => void;
  trailing?: React.ReactNode;
  t: Translate;
}

export function LocalDirectoryHeader({
  roots, root, displayPath, parentPath, loading, onSelectRoot, onGoUp, trailing, t,
}: LocalDirectoryHeaderProps) {
  return (
    <>
      {roots.length > 1 ? (
        <SegmentedControl
          size="sm"
          options={roots.map((item) => ({ value: item.path, label: storageRootLabel(item, t) }))}
          value={root?.path ?? ''}
          onChange={onSelectRoot}
          style={styles.roots}
        />
      ) : null}
      <View style={styles.pathRow}>
        <IconButton
          icon="chevronLeft"
          label={t('Up')}
          size="sm"
          disabled={!parentPath || loading}
          onPress={() => { if (parentPath) onGoUp(parentPath); }}
        />
        <AppText variant="bodyStrong" numberOfLines={1} style={styles.flex}>{displayPath}</AppText>
        {trailing}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  roots: { marginHorizontal: Space.lg, marginBottom: Space.xs },
  pathRow: { flexDirection: 'row', alignItems: 'center', gap: Space.xs, paddingHorizontal: Space.sm, minHeight: 44 },
  flex: { flex: 1 },
});
