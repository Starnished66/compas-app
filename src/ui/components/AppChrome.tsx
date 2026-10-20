import React, { useEffect, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { RemoteAction, RemoteUiState } from '../../data/types';
import { useChromeState } from '../chrome/useChromeState';
import { resolveMiniProgressStyle } from '../miniProgress';
import { useMiniProgressPreference } from '../preferences/useMiniProgressPreference';
import { between } from '../collapse';
import { Durations, motionDuration } from '../motion';
import { WorkletEasings } from '../workletEasings';
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

export function AppChrome({ state, onAction, activeTab, showMiniPlayer, onSelectTab, onOpenNowPlaying }: AppChromeProps) {
  const chrome = useChromeState();
  const reducedMotion = useReducedMotion();
  const insets = useScreenInsets();
  const { preference: progressPreference } = useMiniProgressPreference();
  const [width, setWidth] = useState(0);
  const minimizable = showMiniPlayer && (activeTab === 'library' || activeTab === 'playlists');
  const minimized = chrome.minimized && minimizable;
  const collapse = useSharedValue(minimized ? 1 : 0);
  const { expand, requestScrollToTop } = chrome;

  useEffect(() => {
    if (!minimizable) expand();
  }, [expand, minimizable]);

  useEffect(() => {
    collapse.value = withTiming(minimized ? 1 : 0, {
      duration: motionDuration(reducedMotion, Durations.pill),
      easing: WorkletEasings.responsive,
    });
  }, [collapse, minimized, reducedMotion]);

  const selectTab = (tab: TabKey) => {
    if (tab === activeTab) {
      requestScrollToTop(tab);
      return;
    }
    expand();
    onSelectTab(tab);
  };

  const minimizedRight = minimizedTabBarRightInset(width);
  const tabBarPosition = useAnimatedStyle(() => ({
    right: between(collapse.value, TabBarRightInset, minimizedRight),
  }));
  const miniPlayerPosition = useAnimatedStyle(() => {
    const inset = between(collapse.value, ChromeInset, MinimizedMiniPlayerInset);
    return { left: inset, right: inset, bottom: between(collapse.value, MiniPlayerBottom, ChromeInset) };
  });

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
  playerButton: { position: 'absolute', right: ChromeInset, bottom: ChromeInset },
});
