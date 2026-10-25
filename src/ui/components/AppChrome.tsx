import React from 'react';
import { StyleSheet, View } from 'react-native';
import { RemoteAction, RemoteUiState } from '../../data/types';
import { useChromeState } from '../chrome/useChromeState';
import { resolveMiniProgressStyle } from '../miniProgress';
import { useMiniProgressPreference } from '../preferences/useMiniProgressPreference';
import { TabBar, TabKey } from './TabBar';
import { PlayerButton } from './PlayerButton';
import { MiniPlayer } from './MiniPlayer';
import { ChromeInset, MiniPlayerBottom, TabBarRightInset } from './bottomChromeLayout';
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
  // The tab bar always stays full width; it no longer collapses into a pill while lists scroll.
  const { expand, requestScrollToTop } = useChromeState();
  const insets = useScreenInsets();
  const { preference: progressPreference } = useMiniProgressPreference();

  const selectTab = (tab: TabKey) => {
    if (tab === activeTab) {
      requestScrollToTop(tab);
      return;
    }
    expand();
    onSelectTab(tab);
  };

  return (
    <View
      style={[StyleSheet.absoluteFill, { bottom: insetBeyond(insets.bottom, ChromeInset) }]}
      pointerEvents="box-none"
    >
      {showMiniPlayer && state.currentTrack ? (
        <View style={styles.miniPlayer} pointerEvents="box-none">
          <MiniPlayer
            track={state.currentTrack}
            isPlaying={state.isPlaying}
            progressStyle={resolveMiniProgressStyle(progressPreference, state.playbackMode)}
            onOpen={onOpenNowPlaying}
            onTogglePlayback={() => onAction({ type: 'TogglePlayback' })}
            onPrevious={() => onAction({ type: 'Previous' })}
            onNext={() => onAction({ type: 'Next' })}
          />
        </View>
      ) : null}
      <View style={styles.tabBar} pointerEvents="box-none">
        <TabBar active={activeTab} onSelect={selectTab} />
      </View>
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
  miniPlayer: { position: 'absolute', left: ChromeInset, right: ChromeInset, bottom: MiniPlayerBottom },
  tabBar: { position: 'absolute', left: ChromeInset, right: TabBarRightInset, bottom: ChromeInset },
  playerButton: { position: 'absolute', right: ChromeInset, bottom: ChromeInset },
});
