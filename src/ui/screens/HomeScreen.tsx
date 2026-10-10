import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  View,
} from 'react-native';
import { RemoteAction, RemoteTrack, RemoteUiState } from '../../data/types';
import { useScrollToTopRequest } from '../chrome/useScrollToTopRequest';
import { between, CollapseProgress } from '../collapse';
import { EnterView } from '../components/EnterView';
import { HomeEmptyState } from '../components/HomeEmptyState';
import { HomeTitleBar } from '../components/HomeTitleBar';
import { NowPlayingCard } from '../components/NowPlayingCard';
import { RECONNECT_BANNER_HEIGHT, ReconnectBanner } from '../components/ReconnectBanner';
import { UpNextList } from '../components/UpNextList';
import { canOpenNowPlaying } from '../nowPlayingAccess';
import { isReconnecting } from '../reconnecting';
import { AudioFormatSheet } from '../sheets/AudioFormatSheet';
import { Size, Space } from '../tokens';
import { useReducedMotion } from '../useReducedMotion';

export interface HomeScreenProps {
  state: RemoteUiState;
  onAction: (action: RemoteAction) => void;
  onOpenNowPlaying: () => void;
  onOpenSettings: () => void;
  settingsOpen?: boolean;
  bottomInset?: number;
}

const DEFAULT_BOTTOM_INSET = Size.bar + Space.md * 2;
const CONSOLE_TOP_COLLAPSED = Space.lg;
const CONSOLE_GAP = Space.md;
const ESTIMATED_CARD_EXPANDED = 350;
const ESTIMATED_CARD_COLLAPSED = 94;
const SNAP_DELAY_MS = 140;
const LOAD_MORE_DISTANCE = 480;
const COMPACT_THRESHOLD = 0.5;
const MEASURE_EPSILON = 0.001;
const EXPANDED = new Animated.Value(0);

interface ScrollMetrics {
  offset: number;
  viewport: number;
  content: number;
}

export function HomeScreen({
  state,
  onAction,
  onOpenNowPlaying,
  onOpenSettings,
  settingsOpen = false,
  bottomInset = DEFAULT_BOTTOM_INSET,
}: HomeScreenProps) {
  const reducedMotion = useReducedMotion();
  const track = state.currentTrack;
  const reconnecting = isReconnecting(state);
  const [editing, setEditing] = useState(false);
  const [formatVisible, setFormatVisible] = useState(false);
  const [compact, setCompact] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [cardExpanded, setCardExpanded] = useState(ESTIMATED_CARD_EXPANDED);
  const [cardCollapsed, setCardCollapsed] = useState(ESTIMATED_CARD_COLLAPSED);
  const [upNextHeight, setUpNextHeight] = useState(0);
  const [reordering, setReordering] = useState(false);
  const scrollRef = useRef<FlatList<RemoteTrack>>(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const progressRef = useRef(0);
  const metricsRef = useRef<ScrollMetrics>({ offset: 0, viewport: 0, content: 0 });
  const draggingRef = useRef(false);
  const snapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPageRequestRef = useRef('');

  const bannerBlock = reconnecting ? RECONNECT_BANNER_HEIGHT + CONSOLE_GAP : 0;
  const listPad = Size.bar + bannerBlock + cardExpanded + CONSOLE_GAP;
  const collapseDistance = Math.max(1, listPad - (CONSOLE_TOP_COLLAPSED + bannerBlock + cardCollapsed) - CONSOLE_GAP);
  const fits = listPad + upNextHeight + Space.lg <= viewportHeight - bottomInset;
  const collapsible = viewportHeight > 0 && !fits;

  const collapse: CollapseProgress = useMemo(
    () =>
      collapsible
        ? scrollY.interpolate({ inputRange: [0, collapseDistance], outputRange: [0, 1], extrapolate: 'clamp' })
        : EXPANDED,
    [collapsible, collapseDistance, scrollY],
  );
  const consoleTop = useMemo(() => between(collapse, Size.bar, CONSOLE_TOP_COLLAPSED), [collapse]);

  const geometryRef = useRef({ collapsible, collapseDistance });
  geometryRef.current = { collapsible, collapseDistance };

  useEffect(() => {
    if (editing && state.queue.length === 0) setEditing(false);
  }, [editing, state.queue.length]);

  useEffect(() => () => {
    if (snapTimerRef.current) clearTimeout(snapTimerRef.current);
  }, []);

  useScrollToTopRequest('home', () => scrollRef.current?.scrollToOffset({ offset: 0, animated: !reducedMotion }));

  const toggleEditing = useCallback(() => setEditing((value) => !value), []);

  const openNowPlaying = () => {
    if (canOpenNowPlaying(state)) onOpenNowPlaying();
  };

  const updateProgress = (offset: number) => {
    const { collapsible: canCollapse, collapseDistance: distance } = geometryRef.current;
    const progress = canCollapse ? Math.max(0, Math.min(1, offset / distance)) : 0;
    progressRef.current = progress;
    const nextCompact = progress > COMPACT_THRESHOLD;
    setCompact((previous) => (previous === nextCompact ? previous : nextCompact));
  };

  const loadMoreNearEnd = ({ offset, viewport, content }: ScrollMetrics) => {
    if (!viewport || offset + viewport < content - LOAD_MORE_DISTANCE) {
      lastPageRequestRef.current = '';
      return;
    }
    const key = `${state.queue.length}:${state.queueTotal}`;
    if (state.queueHasMore && !state.queueLoadingMore && lastPageRequestRef.current !== key) {
      lastPageRequestRef.current = key;
      onAction({ type: 'LoadMoreQueue' });
    }
  };

  const cancelSnap = () => {
    if (snapTimerRef.current) clearTimeout(snapTimerRef.current);
    snapTimerRef.current = null;
  };

  const scheduleSnap = () => {
    cancelSnap();
    snapTimerRef.current = setTimeout(() => {
      const { collapsible: canCollapse, collapseDistance: distance } = geometryRef.current;
      const offset = metricsRef.current.offset;
      if (!canCollapse || draggingRef.current || offset <= 0 || offset >= distance) return;
      scrollRef.current?.scrollToOffset({ offset: offset < distance / 2 ? 0 : distance, animated: !reducedMotion });
    }, SNAP_DELAY_MS);
  };

  const scrollHandlersRef = useRef({ updateProgress, loadMoreNearEnd });
  scrollHandlersRef.current = { updateProgress, loadMoreNearEnd };

  const onScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        useNativeDriver: false,
        listener: ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
          metricsRef.current = {
            offset: nativeEvent.contentOffset.y,
            viewport: nativeEvent.layoutMeasurement.height,
            content: nativeEvent.contentSize.height,
          };
          scrollHandlersRef.current.updateProgress(nativeEvent.contentOffset.y);
          scrollHandlersRef.current.loadMoreNearEnd(metricsRef.current);
        },
      }),
    [scrollY],
  );

  const onCardLayout = (event: LayoutChangeEvent) => {
    const height = event.nativeEvent.layout.height;
    if (progressRef.current <= MEASURE_EPSILON) {
      setCardExpanded((previous) => (Math.abs(previous - height) > 0.5 ? height : previous));
    } else if (progressRef.current >= 1 - MEASURE_EPSILON) {
      setCardCollapsed((previous) => (Math.abs(previous - height) > 0.5 ? height : previous));
    }
  };

  if (!track) {
    return (
      <HomeEmptyState
        state={state}
        onAction={onAction}
        onOpenSettings={onOpenSettings}
        settingsOpen={settingsOpen}
        bottomInset={bottomInset}
      />
    );
  }

  return (
    <View style={styles.root}>
      <UpNextList
        ref={scrollRef}
        state={state}
        onAction={onAction}
        editing={editing}
        onToggleEditing={toggleEditing}
        onReorderActiveChange={setReordering}
        onCardHeightChange={setUpNextHeight}
        scrollProps={{
          onLayout: (event) => setViewportHeight(event.nativeEvent.layout.height),
          onScroll,
          scrollEventThrottle: 16,
          scrollEnabled: !reordering,
          onScrollBeginDrag: () => {
            draggingRef.current = true;
            cancelSnap();
          },
          onScrollEndDrag: () => {
            draggingRef.current = false;
            scheduleSnap();
          },
          onMomentumScrollBegin: cancelSnap,
          onMomentumScrollEnd: scheduleSnap,
          onContentSizeChange: (_, content) => {
            metricsRef.current = { ...metricsRef.current, content };
            loadMoreNearEnd(metricsRef.current);
          },
          showsVerticalScrollIndicator: false,
          contentContainerStyle: [
            styles.content,
            { paddingTop: listPad, paddingBottom: bottomInset },
            collapsible && { minHeight: viewportHeight + collapseDistance },
          ],
        }}
      />

      <HomeTitleBar onOpenSettings={onOpenSettings} settingsOpen={settingsOpen} collapse={collapse} compact={compact} />

      <Animated.View pointerEvents="box-none" style={[styles.console, { top: consoleTop }]}>
        {reconnecting ? (
          <EnterView from="down">
            <ReconnectBanner playerName={state.playerName} />
          </EnterView>
        ) : null}
        <NowPlayingCard
          state={state}
          track={track}
          onAction={onAction}
          collapse={collapse}
          compact={compact}
          dimmed={reconnecting}
          onOpenNowPlaying={openNowPlaying}
          onOpenAudioFormat={() => setFormatVisible(true)}
          onLayout={onCardLayout}
        />
      </Animated.View>

      <AudioFormatSheet
        visible={formatVisible}
        track={track}
        transport={state.connectionTransport}
        onClose={() => setFormatVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Space.lg,
  },
  console: {
    position: 'absolute',
    left: Space.lg,
    right: Space.lg,
    gap: CONSOLE_GAP,
  },
});
