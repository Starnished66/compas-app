import { useAnimatedStyle } from 'react-native-reanimated';
import { between, CollapseProgress, fadeInOnCollapse, fadeOnCollapse } from './collapse';
import { Radius, Size, Space, Type } from './tokens';

export const NOW_PLAYING_ART_SIZE = 120;
export const COMPACT_TRANSPORT_WIDTH = Size.controlMd * 3 + Space.xs * 2;
export const TRANSPORT_ROW_HEIGHT = 72;

const ART_COLLAPSED = 48;
const ART_SCALE_COLLAPSED = ART_COLLAPSED / NOW_PLAYING_ART_SIZE;
const ART_OFFSET_COLLAPSED = (ART_COLLAPSED - NOW_PLAYING_ART_SIZE) / 2;
const EYEBROW_HEIGHT = 24;
const ALBUM_MAX_HEIGHT = Type.caption.lineHeight;
const BADGES_MAX_HEIGHT = 48;
const ROW_GAP = 6;
const VOLUME_ROW_HEIGHT = 24;
const SEEK_MAX_HEIGHT = 60;

export function useNowPlayingCardCollapse(collapse: CollapseProgress, seekStays: boolean) {
  const card = useAnimatedStyle(() => ({ padding: between(collapse.value, Space.lg, Space.md) }));
  const eyebrow = useAnimatedStyle(() => ({
    height: between(collapse.value, EYEBROW_HEIGHT, 0),
    marginBottom: between(collapse.value, Space.md, 0),
    opacity: fadeOnCollapse(collapse.value),
  }));
  const mainRow = useAnimatedStyle(() => ({ gap: between(collapse.value, Space.lg, Space.md) }));
  const artFrame = useAnimatedStyle(() => {
    const side = between(collapse.value, NOW_PLAYING_ART_SIZE, ART_COLLAPSED);
    return { width: side, height: side, borderRadius: between(collapse.value, Radius.lg, Radius.md) };
  });
  const artInner = useAnimatedStyle(() => {
    const offset = between(collapse.value, 0, ART_OFFSET_COLLAPSED);
    return { left: offset, top: offset, transform: [{ scale: between(collapse.value, 1, ART_SCALE_COLLAPSED) }] };
  });
  const album = useAnimatedStyle(() => ({
    maxHeight: between(collapse.value, ALBUM_MAX_HEIGHT, 0),
    opacity: fadeOnCollapse(collapse.value),
  }));
  const badges = useAnimatedStyle(() => ({
    maxHeight: between(collapse.value, BADGES_MAX_HEIGHT, 0),
    marginTop: between(collapse.value, Space.xs, 0),
    opacity: fadeOnCollapse(collapse.value),
  }));
  const favorite = useAnimatedStyle(() => ({
    width: between(collapse.value, Size.controlMd, 0),
    opacity: fadeOnCollapse(collapse.value),
  }));
  const compactTransport = useAnimatedStyle(() => ({
    width: between(collapse.value, 0, COMPACT_TRANSPORT_WIDTH),
    opacity: fadeInOnCollapse(collapse.value),
  }));
  const seek = useAnimatedStyle(
    () =>
      seekStays
        ? { marginTop: between(collapse.value, Space.md, Space.sm), maxHeight: SEEK_MAX_HEIGHT, opacity: 1 }
        : {
            marginTop: between(collapse.value, Space.md, 0),
            maxHeight: between(collapse.value, SEEK_MAX_HEIGHT, 0),
            opacity: fadeOnCollapse(collapse.value),
          },
  );
  const collapsedProgress = useAnimatedStyle(() => ({ opacity: fadeInOnCollapse(collapse.value) }));
  const transport = useAnimatedStyle(() => ({
    marginTop: between(collapse.value, ROW_GAP, 0),
    height: between(collapse.value, TRANSPORT_ROW_HEIGHT, 0),
    opacity: fadeOnCollapse(collapse.value),
  }));
  const volume = useAnimatedStyle(() => ({
    marginTop: between(collapse.value, ROW_GAP, 0),
    height: between(collapse.value, VOLUME_ROW_HEIGHT, 0),
    opacity: fadeOnCollapse(collapse.value),
  }));

  return {
    card,
    eyebrow,
    mainRow,
    artFrame,
    artInner,
    album,
    badges,
    favorite,
    compactTransport,
    seek,
    collapsedProgress,
    transport,
    volume,
  };
}
