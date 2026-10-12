import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { RemoteAction, RemoteTrack, RemoteUiState } from '../../data/types';
import { useScrollToTopRequest } from '../chrome/useScrollToTopRequest';
import { between } from '../collapse';
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
import { ScrollMetrics, useHomeScrollCollapse } from '../useHomeScrollCollapse';

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
const LOAD_MORE_DISTANCE = 480;
const CONSOLE_LIFT = CONSOLE_TOP_COLLAPSED - Size.bar;

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
  const [viewportHeight, setViewportHeight] = useState(0);
  const [cardExpanded, setCardExpanded] = useState(ESTIMATED_CARD_EXPANDED);
  const [cardCollapsed, setCardCollapsed] = useState(ESTIMATED_CARD_COLLAPSED);
  const [upNextHeight, setUpNextHeight] = useState(0);
  const [reordering, setReordering] = useState(false);
  const scrollRef = useRef<FlatList<RemoteTrack>>(null);
  const metricsRef = useRef<ScrollMetrics>({ offset: 0, viewport: 0, content: 0 });
  const lastPageRequestRef = useRef('');

  const bannerBlock = reconnecting ? RECONNECT_BANNER_HEIGHT + CONSOLE_GAP : 0;
  const listPad = Size.bar + bannerBlock + cardExpanded + CONSOLE_GAP;
  const collapseDistance = Math.max(1, listPad - (CONSOLE_TOP_COLLAPSED + bannerBlock + cardCollapsed) - CONSOLE_GAP);
  const fits = listPad + upNextHeight + Space.lg <= viewportHeight - bottomInset;
  const collapsible = viewportHeight > 0 && !fits;

  useEffect(() => {
    if (editing && state.queue.length === 0) setEditing(false);
  }, [editing, state.queue.length]);

  useScrollToTopRequest('home', () => scrollRef.current?.scrollToOffset({ offset: 0, animated: !reducedMotion }));

  const toggleEditing = useCallback(() => setEditing((value) => !value), []);

  const openNowPlaying = () => {
    if (canOpenNowPlaying(state)) onOpenNowPlaying();
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

  const { collapse, compact, onScroll, snapEvents, offset, settledStage } = useHomeScrollCollapse({
    listRef: scrollRef,
    collapsible,
    collapseDistance,
    nearEndDistance: LOAD_MORE_DISTANCE,
    reducedMotion,
    onNearEndScroll: (metrics) => {
      metricsRef.current = metrics;
      loadMoreNearEnd(metrics);
    },
  });
  const consoleStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: between(collapse.value, 0, CONSOLE_LIFT) }],
  }));

  const onCardLayout = (event: LayoutChangeEvent) => {
    const height = event.nativeEvent.layout.height;
    const stage = settledStage();
    if (stage === 'expanded') {
      setCardExpanded((previous) => (Math.abs(previous - height) > 0.5 ? height : previous));
    } else if (stage === 'collapsed') {
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
          onLayout: (event) => {
            const viewport = event.nativeEvent.layout.height;
            metricsRef.current = { ...metricsRef.current, viewport };
            setViewportHeight(viewport);
          },
          onScroll,
          scrollEventThrottle: 16,
          scrollEnabled: !reordering,
          ...snapEvents,
          onContentSizeChange: (_, content) => {
            metricsRef.current = { ...metricsRef.current, offset: offset(), content };
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

      <Animated.View pointerEvents="box-none" style={[styles.console, consoleStyle]}>
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
    top: Size.bar,
    left: Space.lg,
    right: Space.lg,
    gap: CONSOLE_GAP,
  },
});
