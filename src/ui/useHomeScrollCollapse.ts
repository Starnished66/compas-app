import { RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import {
  CollapseProgress,
  CollapseStage,
  collapseProgress,
  collapseStage,
  isCompactStage,
  isNearListEnd,
} from './collapse';

export interface ScrollMetrics {
  offset: number;
  viewport: number;
  content: number;
}

interface ScrollableList {
  scrollToOffset(params: { offset: number; animated?: boolean }): void;
}

export interface HomeScrollCollapseOptions {
  listRef: RefObject<ScrollableList | null>;
  collapsible: boolean;
  collapseDistance: number;
  nearEndDistance: number;
  reducedMotion: boolean;
  onNearEndScroll: (metrics: ScrollMetrics) => void;
}

type NearEndContext = { nearEnd?: boolean };

const SNAP_DELAY_MS = 140;

export function useHomeScrollCollapse(options: HomeScrollCollapseOptions) {
  const { collapsible, collapseDistance, nearEndDistance } = options;
  const latest = useRef(options);
  latest.current = options;
  const scrollY = useSharedValue(0);
  const [compact, setCompact] = useState(false);
  const stageRef = useRef<CollapseStage>('expanded');
  const dragging = useRef(false);
  const snapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const collapse: CollapseProgress = useDerivedValue(() =>
    collapseProgress(scrollY.value, collapseDistance, collapsible),
  );

  const applyStage = useCallback((stage: CollapseStage) => {
    stageRef.current = stage;
    setCompact(isCompactStage(stage));
  }, []);

  useAnimatedReaction(
    () => collapseStage(collapse.value),
    (stage, previous) => {
      if (stage !== previous) scheduleOnRN(applyStage, stage);
    },
  );

  const reportNearEnd = useCallback(
    (offset: number, viewport: number, content: number) => latest.current.onNearEndScroll({ offset, viewport, content }),
    [],
  );

  const onScroll = useAnimatedScrollHandler<NearEndContext>({
    onScroll: (event, context) => {
      const offset = event.contentOffset.y;
      const viewport = event.layoutMeasurement.height;
      const content = event.contentSize.height;
      scrollY.value = offset;
      const nearEnd = isNearListEnd(offset, viewport, content, nearEndDistance);
      if (nearEnd || context.nearEnd) scheduleOnRN(reportNearEnd, offset, viewport, content);
      context.nearEnd = nearEnd;
    },
  });

  const cancelSnap = useCallback(() => {
    if (snapTimer.current) clearTimeout(snapTimer.current);
    snapTimer.current = null;
  }, []);

  const scheduleSnap = useCallback(() => {
    cancelSnap();
    snapTimer.current = setTimeout(() => {
      const { collapsible: canCollapse, collapseDistance: distance, reducedMotion, listRef } = latest.current;
      const offset = scrollY.value;
      if (!canCollapse || dragging.current || offset <= 0 || offset >= distance) return;
      listRef.current?.scrollToOffset({ offset: offset < distance / 2 ? 0 : distance, animated: !reducedMotion });
    }, SNAP_DELAY_MS);
  }, [cancelSnap, scrollY]);

  useEffect(() => cancelSnap, [cancelSnap]);

  const snapEvents = useMemo(
    () => ({
      onScrollBeginDrag: () => {
        dragging.current = true;
        cancelSnap();
      },
      onScrollEndDrag: () => {
        dragging.current = false;
        scheduleSnap();
      },
      onMomentumScrollBegin: cancelSnap,
      onMomentumScrollEnd: scheduleSnap,
    }),
    [cancelSnap, scheduleSnap],
  );

  const offset = useCallback(() => scrollY.value, [scrollY]);

  const settledStage = useCallback((): CollapseStage | null => {
    if (stageRef.current !== 'expanded' && stageRef.current !== 'collapsed') return null;
    // Layout events can reach JS before the stage update scheduled from the UI thread.
    const stage = collapseStage(collapse.value);
    return stage === 'expanded' || stage === 'collapsed' ? stage : null;
  }, [collapse]);

  return { collapse, compact, onScroll, snapEvents, offset, settledStage };
}
