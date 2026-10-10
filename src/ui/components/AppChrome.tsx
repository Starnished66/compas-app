import React, { useEffect, useRef, useState } from 'react';
import { Animated, LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { RemoteAction, RemoteUiState } from '../../data/types';
import { useChromeState } from '../chrome/useChromeState';
import { resolveMiniProgressStyle } from '../miniProgress';
import { playbackFraction } from '../playbackTime';
import { useMiniProgressPreference } from '../preferences/useMiniProgressPreference';
import { Durations, Easings, motionDuration } from '../motion';
import { useReducedMotion } from '../useReducedMotion';
import { TabBar, TabKey } from './TabBar';
import { PlayerButton } from './PlayerButton';
import { MiniPlayer } from './MiniPlayer';
import {
  ChromeInset,
  MiniPlayerBottom,
  MinimizedMiniPlayerInset,
  minimizedTabBarRightInset,
  TabBarRightInset,
} from './bottomChromeLayout';
import { useScreenInsets } from '../useScreenInsets';
import { insetBeyond } from '../insetBeyond';

export interface AppChromeProps {
  state: RemoteUiState;
  onAction: (action: RemoteAction) => void;
  activeTab: TabKey | null;
  showMiniPlayer: boolean;
  onSelectTab: (tab: TabKey) => void;
  onOpenNowPlaying: () => void;
}

function between(progress: Animated.Value, from: number, to: number) {
  return progress.interpolate({ inputRange: [0, 1], outputRange: [from, to] });
}

export function AppChrome({ state, onAction, activeTab, showMiniPlayer, onSelectTab, onOpenNowPlaying }: AppChromeProps) {
  const chrome = useChromeState();
  const reducedMotion = useReducedMotion();
  const insets = useScreenInsets();
  const { preference: progressPreference } = useMiniProgressPreference();
  const [width, setWidth] = useState(0);
  const minimizable = showMiniPlayer && (activeTab === 'library' || activeTab === 'playlists');
  const minimized = chrome.minimized && minimizable;
  const collapse = useRef(new Animated.Value(minimized ? 1 : 0)).current;
  const { expand, requestScrollToTop } = chrome;

  useEffect(() => {
    if (!minimizable) expand();
  }, [expand, minimizable]);

  useEffect(() => {
    Animated.timing(collapse, {
      toValue: minimized ? 1 : 0,
      duration: motionDuration(reducedMotion, Durations.pill),
      easing: Easings.overshootSoft,
      useNativeDriver: false,
    }).start();
  }, [collapse, minimized, reducedMotion]);

  const selectTab = (tab: TabKey) => {
    if (tab === activeTab) {
      requestScrollToTop(tab);
      return;
    }
    expand();
    onSelectTab(tab);
  };

  const progress = playbackFraction(state.positionMs, state.durationMs);
  const tabBarPosition =
    width > 0 ? { right: between(collapse, TabBarRightInset, minimizedTabBarRightInset(width)) } : styles.tabBarRight;
  const miniPlayerPosition = {
    left: between(collapse, ChromeInset, MinimizedMiniPlayerInset),
    right: between(collapse, ChromeInset, MinimizedMiniPlayerInset),
    bottom: between(collapse, MiniPlayerBottom, ChromeInset),
  };

  return (
    <View
      style={[StyleSheet.absoluteFill, { bottom: insetBeyond(insets.bottom, ChromeInset) }]}
      pointerEvents="box-none"
      onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
    >
      {showMiniPlayer && state.currentTrack ? (
        <Animated.View style={[styles.miniPlayer, miniPlayerPosition]} pointerEvents="box-none">
          <MiniPlayer
            track={state.currentTrack}
            isPlaying={state.isPlaying}
            progress={progress}
            progressStyle={resolveMiniProgressStyle(progressPreference, state.playbackMode)}
            onOpen={onOpenNowPlaying}
            onTogglePlayback={() => onAction({ type: 'TogglePlayback' })}
            onPrevious={() => onAction({ type: 'Previous' })}
            onNext={() => onAction({ type: 'Next' })}
          />
        </Animated.View>
      ) : null}
      <Animated.View style={[styles.tabBar, tabBarPosition]} pointerEvents="box-none">
        <TabBar active={activeTab} minimized={minimized} onSelect={selectTab} onExpand={expand} />
      </Animated.View>
      <PlayerButton
        style={styles.playerButton}
        status={state.connectionStatus}
        transport={state.connectionTransport}
        playerName={state.playerName}
        pinRequired={state.pinDialogVisible}
        onPress={() => onAction({ type: 'OpenConnection' })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  miniPlayer: { position: 'absolute' },
  tabBar: { position: 'absolute', left: ChromeInset, bottom: ChromeInset },
  tabBarRight: { right: TabBarRightInset },
  playerButton: { position: 'absolute', right: ChromeInset, bottom: ChromeInset },
});
