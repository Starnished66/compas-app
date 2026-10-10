import { Platform } from 'react-native';
import { EdgeInsets, useSafeAreaInsets } from 'react-native-safe-area-context';

const EDGE_TRIM = Platform.select({
  ios: { top: 12, bottom: 16 },
  default: { top: 8, bottom: 0 },
});

export function useScreenInsets(): EdgeInsets {
  const insets = useSafeAreaInsets();
  return {
    ...insets,
    top: Math.max(0, insets.top - EDGE_TRIM.top),
    bottom: Math.max(0, insets.bottom - EDGE_TRIM.bottom),
  };
}
