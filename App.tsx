import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Image,
  Animated,
  StyleSheet,
  BackHandler,
  ToastAndroid,
  Platform,
  SafeAreaView,
  StatusBar as RNStatusBar,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  RemoteTheme,
  ConnectionStatus,
  LibraryCategory,
} from './src/data/types';
import { DarkColors, LightColors, ColorScheme, ArtworkPalette, withArtworkPalette } from './src/ui/theme';
import { extractArtworkPalette } from './modules/compas-bluetooth/src';
import { useRemoteSession } from './src/session/useRemoteSession';
import { HomeScreen } from './src/ui/screens/HomeScreen';
import { LibraryScreen } from './src/ui/screens/LibraryScreen';
import { QueueScreen } from './src/ui/screens/QueueScreen';
import { ConnectionScreen } from './src/ui/screens/ConnectionScreen';
import { MiniPlayerBar } from './src/ui/components/MiniPlayerBar';
import { BottomLibraryBar } from './src/ui/components/BottomLibraryBar';
import { PinDialog } from './src/ui/components/PinDialog';
import { MoreSheet } from './src/ui/components/MoreSheet';
import { artworkImageSource } from './src/ui/artworkSource';

export default function App() {
  const { state, onAction, currentLibraryCategory } = useRemoteSession();
  const [moreSheetVisible, setMoreSheetVisible] = useState(false);
  const [artworkPalette, setArtworkPalette] = useState<ArtworkPalette | null>(null);
  const screenOpacity = useRef(new Animated.Value(1)).current;
  const screenOffset = useRef(new Animated.Value(0)).current;

  const lastBackPressRef = useRef<number>(0);

  const isDark = state.theme === RemoteTheme.Dark;
  const baseColors: ColorScheme = isDark ? DarkColors : LightColors;
  const colors: ColorScheme = useMemo(
    () => artworkPalette ? withArtworkPalette(baseColors, artworkPalette, isDark) : baseColors,
    [artworkPalette, baseColors, isDark]
  );
  const artworkUri = state.currentTrack?.artwork
    ?? (state.screen.type === 'Library' ? state.libraryEntries.find((entry) => entry.artwork)?.artwork : null)
    ?? null;
  const backdropSource = useMemo(() => artworkImageSource(artworkUri), [artworkUri]);
  const screenKey = state.screen.type === 'Library'
    ? `Library:${state.screen.category}:${state.libraryIsNested ? 'nested' : 'root'}`
    : state.screen.type;

  useEffect(() => {
    let current = true;
    setArtworkPalette(null);
    if (artworkUri) {
      extractArtworkPalette(artworkUri).then((palette) => {
        if (current && palette && Number.isFinite(palette.hue) && Number.isFinite(palette.saturation)) {
          setArtworkPalette(palette);
        }
      }).catch(() => {});
    }
    return () => { current = false; };
  }, [artworkUri]);

  useEffect(() => {
    screenOpacity.setValue(0);
    screenOffset.setValue(12);
    Animated.parallel([
      Animated.timing(screenOpacity, { toValue: 1, duration: 210, useNativeDriver: true }),
      Animated.spring(screenOffset, { toValue: 0, speed: 20, bounciness: 3, useNativeDriver: true }),
    ]).start();
  }, [screenKey, screenOpacity, screenOffset]);

  // Android Hardware Back button handling
  useEffect(() => {
    const onBackPress = () => {
      if (moreSheetVisible) {
        setMoreSheetVisible(false);
        return true;
      }

      if (state.pinDialogVisible) {
        onAction({ type: 'DismissPin' });
        return true;
      }

      if (state.screen.type !== 'Home') {
        onAction({ type: 'Back' });
        return true;
      }

      // We are on Home screen: double-tap back to exit within 2000ms
      const now = Date.now();
      if (now - lastBackPressRef.current <= 2000) {
        BackHandler.exitApp();
        return true;
      }

      lastBackPressRef.current = now;
      if (Platform.OS === 'android') {
        ToastAndroid.show('Press back again to exit', ToastAndroid.SHORT);
      }
      return true;
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [state.screen, state.pinDialogVisible, moreSheetVisible, onAction]);

  const renderActiveScreen = () => {
    switch (state.screen.type) {
      case 'Home':
        return <HomeScreen state={state} colors={colors} onAction={onAction} />;

      case 'Library':
        return (
          <LibraryScreen
            state={state}
            category={state.screen.category}
            colors={colors}
            onAction={onAction}
          />
        );

      case 'Queue':
        return <QueueScreen state={state} colors={colors} onAction={onAction} />;

      case 'Connection':
        return (
          <ConnectionScreen state={state} colors={colors} onAction={onAction} />
        );
    }
  };

  const showMiniPlayer =
    state.screen.type !== 'Home' &&
    state.currentTrack != null &&
    state.connectionStatus === ConnectionStatus.Connected;

  return (
    <SafeAreaView
      style={[
        styles.safeArea,
        {
          backgroundColor: colors.background,
          paddingTop: Platform.OS === 'android' ? RNStatusBar.currentHeight : 0,
        },
      ]}
    >
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <View style={styles.ambientBackdrop} pointerEvents="none">
        {backdropSource ? (
          <Image source={backdropSource} style={StyleSheet.absoluteFill} resizeMode="cover" blurRadius={10} />
        ) : (
          <View style={[styles.ambientOrb, styles.ambientOrbOne, { backgroundColor: `${colors.primary}55` }]} />
        )}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(14,15,18,0.34)' : 'rgba(242,243,245,0.38)' }]} />
        {!backdropSource && <View style={[styles.ambientOrb, styles.ambientOrbTwo, { backgroundColor: `${colors.secondary}30` }]} />}
      </View>

      <Animated.View style={[styles.content, { opacity: screenOpacity, transform: [{ translateY: screenOffset }] }]}>
        {renderActiveScreen()}
      </Animated.View>

      {/* Floating Mini Player on non-home screens */}
      {showMiniPlayer && (
        <MiniPlayerBar
          track={state.currentTrack!}
          isPlaying={state.isPlaying}
          colors={colors}
          onOpenHome={() => onAction({ type: 'OpenHome' })}
          onTogglePlayback={() => onAction({ type: 'TogglePlayback' })}
          onPrevious={() => onAction({ type: 'Previous' })}
          onNext={() => onAction({ type: 'Next' })}
        />
      )}

      {/* Bottom Navigation Bar */}
      <BottomLibraryBar
        screen={state.screen}
        colors={colors}
        onHomeSelected={() => onAction({ type: 'OpenHome' })}
        onOpenLibrary={(category) => onAction({ type: 'OpenLibrary', category })}
        onOpenConnection={() => onAction({ type: 'OpenConnection' })}
        onOpenMore={() => setMoreSheetVisible(true)}
      />

      {/* PIN entry modal */}
      <PinDialog
        visible={state.pinDialogVisible}
        pinInput={state.pinInput}
        error={state.pinError}
        cooldownSeconds={state.pinRetryDelaySeconds}
        colors={colors}
        onPinChange={(text) => onAction({ type: 'SetPinInput', value: text })}
        onSubmit={() => onAction({ type: 'SubmitPin' })}
        onDismiss={() => onAction({ type: 'DismissPin' })}
      />

      {/* More / Settings modal bottom sheet */}
      <MoreSheet
        visible={moreSheetVisible}
        theme={state.theme}
        connectionStatus={state.connectionStatus}
        playerName={state.playerName}
        colors={colors}
        onClose={() => setMoreSheetVisible(false)}
        onToggleTheme={() => onAction({ type: 'ToggleTheme' })}
        onSelectCategory={(category) => onAction({ type: 'OpenLibrary', category })}
        onDisconnect={() => onAction({ type: 'Disconnect' })}
        onChangePin={() => onAction({ type: 'ChangePin' })}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  ambientBackdrop: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
    backgroundColor: '#111214',
  },
  ambientOrb: {
    position: 'absolute',
    width: 340,
    height: 340,
    borderRadius: 170,
  },
  ambientOrbOne: {
    top: '8%',
    left: '-28%',
  },
  ambientOrbTwo: {
    right: '-35%',
    bottom: '8%',
  },
});
