import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LibraryEntry } from '../../data/types';
import { Space } from '../tokens';
import { ALBUM_GRID_GAP } from '../library/useAlbumGrid';
import { AlbumTile } from './AlbumTile';

export interface AlbumTileRowProps {
  entries: LibraryEntry[];
  tileWidth: number;
  onPress: (entry: LibraryEntry) => void;
  selectionMode?: boolean;
  selectedIds?: ReadonlySet<string>;
  onLongPress?: (entry: LibraryEntry) => void;
}

function AlbumTileRowContent({ entries, tileWidth, onPress, selectionMode = false, selectedIds, onLongPress }: AlbumTileRowProps) {
  return (
    <View style={styles.row}>
      {entries.map((entry, column) => (
        <AlbumTile key={column} entry={entry} width={tileWidth} onPress={onPress} selectionMode={selectionMode} selected={selectedIds?.has(entry.id)} onLongPress={onLongPress} />
      ))}
    </View>
  );
}

export const AlbumTileRow = React.memo(AlbumTileRowContent);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: ALBUM_GRID_GAP,
    paddingHorizontal: Space.lg,
    paddingTop: Space.md,
    paddingBottom: Space.xs,
  },
});
