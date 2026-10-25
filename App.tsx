import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { ConnectionStatus, LibraryCategory, RemoteScreen, RemoteTheme, RemoteUiState } from './src/data/types';
import { useRemoteSession } from './src/session/useRemoteSession';
import { PaletteProvider } from './src/ui/PaletteProvider';
import { PlaybackPositionContext } from './src/ui/playbackPositionContext';
import { LibraryArtworkContext } from './src/ui/library/libraryArtworkContext';
import { ChromeProvider } from './src/ui/chrome/ChromeProvider';
import { AccentSource, useArtworkPalette } from './src/ui/useArtworkPalette';
import { MiniProgressPreferenceProvider } from './src/ui/preferences/MiniProgressPreferenceProvider';
import { BackgroundPreferenceProvider } from './src/ui/preferences/BackgroundPreferenceProvider';
import { useAccentPreference } from './src/ui/preferences/useAccentPreference';
import { AccentStyle, accentFollowsArtwork } from './src/ui/accentStyle';
import { useHardwareBack } from './src/ui/useHardwareBack';
import { dispatchBackInterceptor } from './src/ui/useBackInterceptor';
import { canOpenNowPlaying } from './src/ui/nowPlayingAccess';
import { AppBackdrop } from './src/ui/components/AppBackdrop';
import { AppChrome } from './src/ui/components/AppChrome';
import { AppSnackbarProvider } from './src/ui/components/AppSnackbarProvider';
import { PageTransition } from './src/ui/components/PageTransition';
import { SlideUpScreen } from './src/ui/components/SlideUpScreen';
import { TabPane } from './src/ui/components/TabPane';
import { TabKey } from './src/ui/components/TabBar';
import { chromeContentInset } from './src/ui/components/bottomChromeLayout';
import { PinDialog } from './src/ui/components/PinDialog';
import { SessionSnackbars } from './src/ui/components/SessionSnackbars';
import { HomeScreen } from './src/ui/screens/HomeScreen';
import { LibraryScreen } from './src/ui/screens/LibraryScreen';
import { PlaylistsScreen } from './src/ui/screens/PlaylistsScreen';
import { TransferApi, TransferScreen } from './src/ui/screens/TransferScreen';
import { ConnectionScreen } from './src/ui/screens/ConnectionScreen';
import { NowPlayingScreen } from './src/ui/screens/NowPlayingScreen';
import { SettingsSheet } from './src/ui/sheets/SettingsSheet';
import { SongActionsSheet } from './src/ui/sheets/SongActionsSheet';
import { UpdatesProvider } from './src/updates/UpdatesProvider';
import { UpdateAnnouncements } from './src/ui/components/UpdateAnnouncements';
import { UpdatesSheet } from './src/ui/sheets/UpdatesSheet';
import { useScreenInsets } from './src/ui/useScreenInsets';
import CrashReportRecovery from './src/diagnostics/CrashReportRecovery';

const TAB_ORDER: TabKey[] = ['home', 'library', 'playlists', 'transfer'];

const nonBrowsableLibraryCategories = new Set<LibraryCategory>([LibraryCategory.Playlists, LibraryCategory.Search]);

type MainScreen = Exclude<RemoteScreen, { type: 'Connection' | 'Queue' }>;

function tabFor(screen: MainScreen): TabKey {
  if (screen.type === 'Library') return screen.category === LibraryCategory.Playlists ? 'playlists' : 'library';
  if (screen.type === 'Transfer') return 'transfer';
  return 'home';
}

const accentStatuses = new Set<ConnectionStatus>([ConnectionStatus.Connected, ConnectionStatus.Connecting]);

function accentSourceFor(state: RemoteUiState, accentStyle: AccentStyle): AccentSource {
  if (accentStyle === 'player') {
    if (state.connectionStatus === ConnectionStatus.Connected && state.supportedFeatures.includes('player_accent') && state.playerAccentColor) {
      return { kind: 'player', color: state.playerAccentColor };
    }
    return { kind: 'neutral' };
  }
  if (!accentFollowsArtwork(accentStyle)) return { kind: 'neutral' };
  if (!accentStatuses.has(state.connectionStatus) || !state.currentTrack) return { kind: 'neutral' };
  return state.currentTrack.artwork ? { kind: 'artwork', uri: state.currentTrack.artwork } : { kind: 'pending' };
}

export default function App() {
  const { state, onAction, playbackPosition, libraryArtwork, wifiImportStatus, startWifiImport, stopWifiImport, listWifiImportFiles, uploadWifiImportFile, renameWifiImportFile, deleteWifiImportFile, createWifiImportDirectory } = useRemoteSession();
  const transfer: TransferApi = {
    status: wifiImportStatus,
    start: startWifiImport,
    finish: stopWifiImport,
    list: listWifiImportFiles,
    upload: uploadWifiImportFile,
    rename: renameWifiImportFile,
    remove: deleteWifiImportFile,
    mkdir: createWifiImportDirectory,
  };
  const [nowPlayingVisible, setNowPlayingVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [updatesVisible, setUpdatesVisible] = useState(false);
  const lastBrowseCategoryRef = useRef<LibraryCategory>(LibraryCategory.Albums);
  const lastMainScreenRef = useRef<MainScreen>({ type: 'Home' });
  const [connectionReturnCount, setConnectionReturnCount] = useState(0);

  const systemScheme = useColorScheme();
  const isDark = state.theme === RemoteTheme.System ? systemScheme !== 'light' : state.theme === RemoteTheme.Dark;
  const { preference: accentStyle } = useAccentPreference();
  const palette = useArtworkPalette(accentSourceFor(state, accentStyle), isDark);
  const connectionVisible = state.screen.type === 'Connection';
  if (state.screen.type !== 'Connection' && state.screen.type !== 'Queue') lastMainScreenRef.current = state.screen;
  const mainScreen = lastMainScreenRef.current;
  const libraryCategory = mainScreen.type === 'Library' ? mainScreen.category : null;
  const activeTab = tabFor(mainScreen);
  const isConnected = state.connectionStatus === ConnectionStatus.Connected;
  const showMiniPlayer = mainScreen.type !== 'Home' && isConnected && state.currentTrack != null;
  const insets = useScreenInsets();
  const contentBottomInset = chromeContentInset(showMiniPlayer, insets.bottom);

  useEffect(() => {
    if (libraryCategory && !nonBrowsableLibraryCategories.has(libraryCategory)) {
      lastBrowseCategoryRef.current = libraryCategory;
    }
  }, [libraryCategory]);

  useEffect(() => {
    if (!state.currentTrack || !isConnected) setNowPlayingVisible(false);
  }, [state.currentTrack, isConnected]);

  const queueOpen = state.screen.type === 'Queue';
  useEffect(() => {
    if (queueOpen && !nowPlayingVisible) onAction({ type: 'Back' });
  }, [queueOpen, nowPlayingVisible, onAction]);

  const handleConnectionHidden = useCallback(() => setConnectionReturnCount((count) => count + 1), []);

  const handleBack = useCallback(() => {
    if (nowPlayingVisible) {
      setNowPlayingVisible(false);
      return true;
    }
    // Screen interceptors (selection, playlist edit) sit under Now Playing but above navigation.
    if (dispatchBackInterceptor()) return true;
    if (state.screen.type !== 'Home') {
      onAction({ type: 'Back' });
      return true;
    }
    return false;
  }, [nowPlayingVisible, state.screen.type, onAction]);
  useHardwareBack(handleBack);

  const selectTab = useCallback((tab: TabKey) => {
    setNowPlayingVisible(false);
    if (tab === 'home') onAction({ type: 'OpenHome' });
    else if (tab === 'playlists') onAction({ type: 'OpenLibrary', category: LibraryCategory.Playlists });
    else if (tab === 'transfer') onAction({ type: 'OpenTransfer' });
    else onAction({ type: 'OpenLibrary', category: lastBrowseCategoryRef.current });
  }, [onAction]);

  const nowPlayingAllowed = canOpenNowPlaying(state);
  const openNowPlaying = useCallback(() => {
    if (nowPlayingAllowed) setNowPlayingVisible(true);
  }, [nowPlayingAllowed]);
  const openSettings = useCallback(() => setSettingsVisible(true), []);
  const openUpdates = useCallback(() => setUpdatesVisible(true), []);

  const [visitedTabs] = useState(() => new Set<TabKey>());
  visitedTabs.add(activeTab);

  const renderActiveTab = () => {
    switch (mainScreen.type) {
      case 'Home':
        return <HomeScreen state={state} onAction={onAction} onOpenNowPlaying={openNowPlaying} onOpenSettings={openSettings} settingsOpen={settingsVisible} bottomInset={contentBottomInset} />;
      case 'Library':
        return mainScreen.category === LibraryCategory.Playlists
          ? <PlaylistsScreen state={state} onAction={onAction} contentBottomInset={contentBottomInset} />
          : <LibraryScreen state={state} onAction={onAction} category={mainScreen.category} contentBottomInset={contentBottomInset} />;
      case 'Transfer':
        return null;
    }
  };

  return (
    <UpdatesProvider playerVersion={state.supportedFeatures.includes('device_info') ? state.playerVersion : null}>
    <PlaybackPositionContext.Provider value={playbackPosition}>
      <LibraryArtworkContext.Provider value={libraryArtwork}>
        <PaletteProvider palette={palette}>
          <ChromeProvider>
            <MiniProgressPreferenceProvider>
              <BackgroundPreferenceProvider>
                <View style={[styles.root, { backgroundColor: palette.background }]}>
                  <AppBackdrop
                    artworkUri={state.currentTrack?.artwork ?? null}
                    prominent={mainScreen.type === 'Home'}
                    paused={nowPlayingVisible}
                  />
                  <AppSnackbarProvider showMiniPlayer={showMiniPlayer} chromeHidden={connectionVisible}>
                    <StatusBar style={isDark ? 'light' : 'dark'} />
                    <SessionSnackbars state={state} />
                    <UpdateAnnouncements onOpenUpdates={openUpdates} />
                    <CrashReportRecovery />
                    <View
                      importantForAccessibility={nowPlayingVisible ? 'no-hide-descendants' : 'auto'}
                      accessibilityElementsHidden={nowPlayingVisible}
                      style={[styles.root, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}
                    >
                      <View style={styles.root}>
                        <PageTransition style={styles.content} transitionKey={`${activeTab}:${connectionReturnCount}`} kind="fade">
                          {TAB_ORDER.filter((tab) => visitedTabs.has(tab)).map((tab) => (
                            <TabPane key={tab} active={tab === activeTab}>
                              {tab === 'transfer'
                                // Stays mounted once opened so uploads keep running while other tabs are browsed.
                                ? <TransferScreen state={state} onAction={onAction} transfer={transfer} active={activeTab === 'transfer'} contentBottomInset={contentBottomInset} />
                                : tab === activeTab ? renderActiveTab() : null}
                            </TabPane>
                          ))}
                        </PageTransition>
                        <AppChrome
                          state={state}
                          onAction={onAction}
                          activeTab={activeTab}
                          showMiniPlayer={showMiniPlayer}
                          onSelectTab={selectTab}
                          onOpenNowPlaying={openNowPlaying}
                        />
                      </View>
                    </View>
                    <SlideUpScreen visible={connectionVisible} onHidden={handleConnectionHidden}>
                      <ConnectionScreen state={state} onAction={onAction} />
                    </SlideUpScreen>
                    <NowPlayingScreen
                      state={state}
                      onAction={onAction}
                      visible={nowPlayingVisible}
                      onClose={() => setNowPlayingVisible(false)}
                    />
                    <SettingsSheet
                      state={state}
                      onAction={onAction}
                      visible={settingsVisible}
                      onClose={() => setSettingsVisible(false)}
                      onOpenConnection={() => onAction({ type: 'OpenConnection' })}
                      onOpenUpdates={openUpdates}
                      onOpenTransfer={() => onAction({ type: 'OpenTransfer' })}
                    />
                    <UpdatesSheet visible={updatesVisible} onClose={() => setUpdatesVisible(false)} playerVersion={state.supportedFeatures.includes('device_info') ? state.playerVersion : null} />
                    <SongActionsSheet state={state} onAction={onAction} />
                    <PinDialog state={state} onAction={onAction} />
                  </AppSnackbarProvider>
                </View>
              </BackgroundPreferenceProvider>
            </MiniProgressPreferenceProvider>
          </ChromeProvider>
        </PaletteProvider>
      </LibraryArtworkContext.Provider>
    </PlaybackPositionContext.Provider>
    </UpdatesProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1 },
});
