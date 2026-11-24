import React, { useEffect, useRef, useState } from 'react';
import {
  Animated as RNAnimated,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { RemoteAction, RemoteUiState } from '../../data/types';
import { AppBackdrop } from '../components/AppBackdrop';
import { BottomSheet } from '../components/BottomSheet';
import { SheetActionRow } from '../components/SheetActionRow';
import { SheetStepTitle } from '../components/SheetStepTitle';
import { Durations, Easings, motionDuration } from '../motion';
import { isReconnecting } from '../reconnecting';
import { AudioFormatSheet } from '../sheets/AudioFormatSheet';
import { QueuePlaybackState, QueueSheet } from '../sheets/QueueSheet';
import { SnackbarHost } from '../snackbar/SnackbarHost';
import { Space } from '../tokens';
import { useOpacityTransition } from '../useOpacityTransition';
import { PlayerCommandState, usePlayerCommands } from '../usePlayerCommands';
import { useReducedMotion } from '../useReducedMotion';
import { useTrackChangeMotion } from '../useTrackChangeMotion';
import { useScreenInsets } from '../useScreenInsets';
import { insetBeyond } from '../insetBeyond';
import { useI18n } from '../../i18n';
import { useDisplayTrack } from '../useDisplayTrack';
import { useNowPlayingDismissGesture, useNowPlayingDismissState, useNowPlayingDismissVisibility } from './useNowPlayingDismissGesture';
import { renderNowPlayingArtworkPanel, renderNowPlayingControls } from './nowPlayingPanels';

export interface NowPlayingScreenProps extends PlayerCommandState, QueuePlaybackState,
  Pick<RemoteUiState, 'connectionStatus' | 'playerName' | 'volume'> {
  queueOpen: boolean;
  onAction: (action: RemoteAction) => void;
  visible: boolean;
  onClose: () => void;
}

const PAUSED_ART_SCALE = 0.88;
const DIMMED_OPACITY = 0.45;
const DIM_DURATION = 250;
const SKIPPING_META_OPACITY = 0.5;
export function NowPlayingScreen(props: NowPlayingScreenProps) {
  return renderNowPlayingScreen(props, useNowPlayingScreen(props));
}

function useNowPlayingScreen({ queueOpen: _queueOpen, onAction, visible, onClose, ...state }: NowPlayingScreenProps) {
  const { t } = useI18n();
  const reducedMotion = useReducedMotion();
  const insets = useScreenInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [formatVisible, setFormatVisible] = useState(false);
  const [trackMenuVisible, setTrackMenuVisible] = useState(false);
  const [artArea, setArtArea] = useState({ width: 0, height: 0 });
  const gestureState = useNowPlayingDismissState(visible, windowHeight, onClose);
  const artScale = useRef(new RNAnimated.Value(state.isPlaying ? 1 : PAUSED_ART_SCALE)).current;

  const track = state.currentTrack;
  const shown = useDisplayTrack(track, state.dacMode, state.isPlaying);
  const lastVisibleArtwork = useRef(track?.artwork ?? null);
  if (visible) lastVisibleArtwork.current = track?.artwork ?? null;
  const reconnecting = isReconnecting(state);
  const commands = usePlayerCommands(state, onAction);
  const { artStyle, metaStyle } = useTrackChangeMotion(track, visible);
  const liveOpacity = useOpacityTransition(reconnecting, DIMMED_OPACITY, DIM_DURATION);
  const metaOpacity = useOpacityTransition(commands.skipping, SKIPPING_META_OPACITY, DIM_DURATION);

  useNowPlayingDismissVisibility(gestureState, visible, windowHeight, reducedMotion, (token) => requestGestureClose(token));
  useEffect(() => {
    if (!visible) {
      setFormatVisible(false);
      setTrackMenuVisible(false);
    }
  }, [visible]);

  useNowPlayingArtScale(artScale, visible, state.isPlaying, reducedMotion);

  const { panGesture, playerAnimatedStyle, scrimAnimatedStyle, requestGestureClose } = useNowPlayingDismissGesture(
    gestureState, visible, windowHeight, reducedMotion,
  );
  return {
    t, insets, formatVisible, setFormatVisible, trackMenuVisible, setTrackMenuVisible,
    artArea, setArtArea, artScale, track, shown, lastVisibleArtwork, reconnecting,
    commands, artStyle, metaStyle, liveOpacity, metaOpacity, panGesture, playerAnimatedStyle, scrimAnimatedStyle,
  };
}

function useNowPlayingArtScale(artScale: RNAnimated.Value, visible: boolean, isPlaying: boolean, reducedMotion: boolean) {
  useEffect(() => {
    if (!visible) {
      artScale.setValue(isPlaying ? 1 : PAUSED_ART_SCALE);
      return;
    }
    const animation = RNAnimated.timing(artScale, {
      toValue: isPlaying ? 1 : PAUSED_ART_SCALE,
      duration: motionDuration(reducedMotion, Durations.artPaused),
      easing: Easings.standard,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [artScale, reducedMotion, isPlaying, visible]);
}

function renderNowPlayingScreen(
  { queueOpen, onAction, visible, onClose, ...state }: NowPlayingScreenProps,
  model: ReturnType<typeof useNowPlayingScreen>,
) {
  const {
    t, insets, formatVisible, setFormatVisible, trackMenuVisible, setTrackMenuVisible,
    artArea, setArtArea, artScale, track, shown, lastVisibleArtwork, reconnecting,
    commands, artStyle, metaStyle, liveOpacity, metaOpacity, panGesture, playerAnimatedStyle, scrimAnimatedStyle,
  } = model;
  return (
    <View
      pointerEvents={visible ? 'auto' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      style={styles.root}
    >
      <Animated.View pointerEvents="none" style={[styles.scrim, scrimAnimatedStyle]} />
      <Animated.View
        accessibilityViewIsModal={visible}
        accessibilityElementsHidden={!visible}
        importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
        accessibilityLabel={t('Now playing')}
        style={[styles.player, playerAnimatedStyle]}
      >
        {/* The queue sheet covers this screen; animating underneath it only costs frames while the queue scrolls. */}
        <AppBackdrop
          artworkUri={visible ? track?.artwork : lastVisibleArtwork.current}
          paused={!visible || queueOpen}
        />
        <View collapsable={false} style={[styles.page, { paddingTop: insets.top, paddingBottom: Space.xl + insetBeyond(insets.bottom, Space.xl) }]}>
          {renderNowPlayingArtworkPanel({
            panGesture, onClose, reconnecting, playerName: state.playerName, liveOpacity, artArea, setArtArea, artScale,
            artStyle, artwork: track?.artwork, t,
          })}
          {renderNowPlayingControls({
            state, onAction, visible, reconnecting, liveOpacity, metaOpacity, metaStyle, shown, track,
            commands, showFormat: () => setFormatVisible(true),
            showTrackMenu: () => setTrackMenuVisible(true),
            onClose, t,
          })}
        </View>
        <BottomSheet visible={trackMenuVisible} onClose={() => setTrackMenuVisible(false)}>
          <SheetStepTitle title={track?.title || t('Now playing')} />
          {track?.album ? (
            <SheetActionRow
              icon="disc"
              label={t('Go to album')}
              subtitle={track.album}
              onPress={() => {
                setTrackMenuVisible(false);
                onClose();
                onAction({ type: 'GoToAlbum', album: track.album, title: track.title, artist: track.artist });
              }}
            />
          ) : null}
          {track?.artist ? (
            <SheetActionRow
              icon="person"
              label={t('Go to artist')}
              subtitle={track.artist}
              onPress={() => {
                setTrackMenuVisible(false);
                onClose();
                onAction({ type: 'GoToArtist', artist: track.artist });
              }}
            />
          ) : null}
        </BottomSheet>
        <AudioFormatSheet
          visible={formatVisible}
          track={track}
          transport={state.connectionTransport}
          onClose={() => setFormatVisible(false)}
        />
        <QueueSheet
          state={state}
          onAction={onAction}
          visible={queueOpen}
          onClose={() => onAction({ type: 'Back' })}
        />
      </Animated.View>
      <SnackbarHost bottomOffset={Space.lg + insetBeyond(insets.bottom, Space.lg)} active={visible} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: 10,
  },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#000000',
  },
  player: {
    ...StyleSheet.absoluteFill,
  },
  page: {
    flex: 1,
    paddingHorizontal: Space.xl,
  },
});
