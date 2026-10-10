import { useWindowDimensions } from 'react-native';
import { Space } from '../tokens';

const MIN_TILE_WIDTH = 176;

export const ALBUM_GRID_GAP = Space.md;

export function useAlbumGrid() {
  const { width } = useWindowDimensions();
  const available = width - Space.lg * 2;
  const columns = Math.max(2, Math.floor((available + ALBUM_GRID_GAP) / (MIN_TILE_WIDTH + ALBUM_GRID_GAP)));
  const tileWidth = Math.floor((available - ALBUM_GRID_GAP * (columns - 1)) / columns);
  return { columns, tileWidth };
}
