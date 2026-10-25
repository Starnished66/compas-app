import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated as RNAnimated,
  LayoutChangeEvent,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { RemoteAction, RemoteUiState } from '../../data/types';
import { AppBackdrop } from '../components/AppBackdrop';
import { AppText } from '../components/AppText';
import { ArtworkThumb } from '../components/ArtworkThumb';
import { AudioFormatBadges } from '../components/AudioFormatBadges';
import { EnterView } from '../components/EnterView';
import { FavoriteButton } from '../components/FavoriteButton';
import { NowPlayingFooter } from '../components/NowPlayingFooter';
import { ReconnectBanner } from '../components/ReconnectBanner';
import { SeekBar } from '../components/SeekBar';
import { SheetHandle } from '../components/SheetHandle';
import { TransportControls } from '../components/TransportControls';
import { VolumeRow } from '../components/VolumeRow';
import { Distances, Durations, Easings, motionDuration } from '../motion';
import { isReconnecting } from '../reconnecting';
import { AudioFormatSheet } from '../sheets/AudioFormatSheet';
import { QueueSheet } from '../sheets/QueueSheet';
import { SnackbarHost } from '../snackbar/SnackbarHost';
import { Space } from '../tokens';
import { useOpacityTransition } from '../useOpacityTransition';
import { usePlayerCommands } from '../usePlayerCommands';
import { useReducedMotion } from '../useReducedMotion';
import { useTrackChangeMotion } from '../useTrackChangeMotion';
import { useScreenInsets } from '../useScreenInsets';
import { insetBeyond } from '../insetBeyond';
import { useI18n } from '../../i18n';
import {
  shouldCommitNowPlayingGestureClose,
  shouldDismissNowPlaying,
  shouldRequestNowPlayingGestureClose,
} from '../nowPlayingGesture';

export interface NowPlayingScreenProps {
  state: RemoteUiState;
  onAction: (action: RemoteAction) => void;
  visible: boolean;
  onClose: () => void;
}

const PAUSED_ART_SCALE = 0.88;
const DIMMED_OPACITY = 0.45;
const DIM_DURATION = 250;
const SKIPPING_META_OPACITY = 0.5;
const FAVORITE_EDGE_PULL = 10;
const FAVORITE_PULL = { marginTop: -Space.sm, marginRight: -FAVORITE_EDGE_PULL };
const ART_TOP_PADDING = Space.sm;

export function NowPlayingScreen({ state, onAction, visible, onClose }: NowPlayingScreenProps) {
  const { t } = useI18n();
  const reducedMotion = useReducedMotion();
  const insets = useScreenInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [formatVisible, setFormatVisible] = useState(false);
  const [artArea, setArtArea] = useState({ width: 0, height: 0 });
  const offset = useSharedValue(windowHeight);
  const targetOffset = useSharedValue(visible ? 0 : windowHeight);
  const gestureClosePending = useSharedValue(false);
  const gestureCloseToken = useSharedValue(0);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const dragStart = useSharedValue(0);
  const artScale = useRef(new RNAnimated.Value(state.isPlaying ? 1 : PAUSED_ART_SCALE)).current;

  const track = state.currentTrack;
  const lastVisibleArtwork = useRef(track?.artwork ?? null);
  if (visible) lastVisibleArtwork.current = track?.artwork ?? null;
  const reconnecting = isReconnecting(state);
  const commands = usePlayerCommands(state, onAction);
  const { artStyle, metaStyle } = useTrackChangeMotion(track, visible);
  const liveOpacity = useOpacityTransition(reconnecting, DIMMED_OPACITY, DIM_DURATION);
  const metaOpacity = useOpacityTransition(commands.skipping, SKIPPING_META_OPACITY, DIM_DURATION);

  useEffect(() => {
    if (visible && gestureClosePending.value) {
      const closeToken = gestureCloseToken.value;
      targetOffset.value = windowHeight;
      if (reducedMotion) {
        offset.value = windowHeight;
        requestGestureClose(closeToken);
        return;
      }
      offset.value = withSpring(windowHeight, {
        damping: 38,
        stiffness: 500,
        mass: 0.75,
        overshootClamping: true,
      }, (finished) => {
        if (shouldCommitNowPlayingGestureClose(
          finished,
          gestureClosePending.value,
          closeToken,
          gestureCloseToken.value,
          targetOffset.value,
          windowHeight,
        )) {
          runOnJS(requestGestureClose)(closeToken);
        }
      });
      return;
    }
    if (visible) {
      gestureCloseToken.value += 1;
      gestureClosePending.value = false;
    }
    if (!visible && gestureClosePending.value) {
      gestureCloseToken.value += 1;
      gestureClosePending.value = false;
      targetOffset.value = windowHeight;
      offset.value = windowHeight;
      return;
    }
    if (!visible) {
      gestureCloseToken.value += 1;
      gestureClosePending.value = false;
    }
    targetOffset.value = visible ? 0 : windowHeight;
    if (reducedMotion) {
      offset.value = visible ? 0 : windowHeight;
      return;
    }
    offset.value = withSpring(visible ? 0 : windowHeight, {
      damping: 38,
      stiffness: 500,
      mass: 0.75,
      overshootClamping: true,
    });
  }, [gestureClosePending, gestureCloseToken, offset, reducedMotion, targetOffset, visible, windowHeight]);

  useEffect(() => {
    if (!visible) setFormatVisible(false);
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      artScale.setValue(state.isPlaying ? 1 : PAUSED_ART_SCALE);
      return;
    }
    const animation = RNAnimated.timing(artScale, {
      toValue: state.isPlaying ? 1 : PAUSED_ART_SCALE,
      duration: motionDuration(reducedMotion, Durations.artPaused),
      easing: Easings.standard,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [artScale, reducedMotion, state.isPlaying, visible]);

  // Stable so the memoized pan gesture can call it from the UI thread without capturing a stale onClose.
  const requestGestureClose = useCallback((token: number) => {
    if (shouldRequestNowPlayingGestureClose(
      visibleRef.current,
      gestureClosePending.value,
      token,
      gestureCloseToken.value,
      targetOffset.value,
      windowHeight,
    )) {
      onCloseRef.current();
    }
  }, [gestureClosePending, gestureCloseToken, targetOffset, windowHeight]);

  const panGesture = useMemo(() => Gesture.Pan()
    .enabled(visible)
    .activeOffsetY(10)
    .failOffsetX([-14, 14])
    .onBegin(() => {
      cancelAnimation(offset);
      if (gestureClosePending.value) {
        gestureCloseToken.value += 1;
        gestureClosePending.value = false;
        targetOffset.value = 0;
      }
      dragStart.value = offset.value;
    })
    .onUpdate((event) => {
      offset.value = Math.min(windowHeight, Math.max(0, dragStart.value + event.translationY));
    })
    .onEnd((event) => {
      if (targetOffset.value !== 0) {
        offset.value = targetOffset.value;
        return;
      }
      if (shouldDismissNowPlaying(event.translationY, event.velocityY)) {
        const closeToken = gestureCloseToken.value + 1;
        gestureCloseToken.value = closeToken;
        targetOffset.value = windowHeight;
        gestureClosePending.value = true;
        if (reducedMotion) {
          offset.value = windowHeight;
          runOnJS(requestGestureClose)(closeToken);
          return;
        }
        offset.value = withSpring(windowHeight, {
          damping: 38,
          stiffness: 500,
          mass: 0.75,
          overshootClamping: true,
          velocity: Math.max(0, event.velocityY),
        }, (finished) => {
          if (shouldCommitNowPlayingGestureClose(
            finished,
            gestureClosePending.value,
            closeToken,
            gestureCloseToken.value,
            targetOffset.value,
            windowHeight,
          )) {
            runOnJS(requestGestureClose)(closeToken);
          }
        });
        return;
      }
      if (reducedMotion) {
        offset.value = 0;
        return;
      }
      offset.value = withSpring(0, {
        damping: 38,
        stiffness: 500,
        mass: 0.75,
        overshootClamping: true,
        velocity: event.velocityY,
      });
    })
    .onFinalize((_event, success) => {
      if (!success) {
        offset.value = reducedMotion
          ? targetOffset.value
          : withSpring(targetOffset.value, {
              damping: 38,
              stiffness: 500,
              mass: 0.75,
              overshootClamping: true,
            });
      }
    }), [dragStart, gestureClosePending, gestureCloseToken, offset, reducedMotion, requestGestureClose, targetOffset, visible, windowHeight]);

  const playerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.value }],
  }));
  const scrimAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(offset.value, [0, Math.max(1, windowHeight)], [0.58, 0], Extrapolation.CLAMP),
  }));

  const openConnection = () => {
    onClose();
    onAction({ type: 'OpenConnection' });
  };

  const artSize = Math.max(0, Math.min(artArea.width, artArea.height - ART_TOP_PADDING));
  const subtitle = track ? [track.artist || t('Unknown artist'), track.album].filter(Boolean).join(' · ') : '';
  const canFavorite = state.supportedFeatures.includes('favorites_edit');

  const onArtAreaLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setArtArea((previous) => (previous.width === width && previous.height === height ? previous : { width, height }));
  };

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
        <AppBackdrop artworkUri={visible ? track?.artwork : lastVisibleArtwork.current} paused={!visible} />
        <View collapsable={false} style={[styles.page, { paddingTop: insets.top, paddingBottom: Space.xl + insetBeyond(insets.bottom, Space.xl) }]}>
          <GestureDetector gesture={panGesture}>
            <View style={styles.dismissSurface}>
              <SheetHandle label={t('Close Now playing')} onClose={onClose} onPress={onClose} style={styles.handle} />
              {reconnecting ? (
                <EnterView from="down" style={styles.banner}>
                  <ReconnectBanner playerName={state.playerName} />
                </EnterView>
              ) : null}
              <RNAnimated.View pointerEvents={reconnecting ? 'none' : 'auto'} style={{ flex: 1, opacity: liveOpacity }}>
                <View style={styles.artArea} onLayout={onArtAreaLayout}>
                  {artSize > 0 ? (
                    <RNAnimated.View style={{ transform: [{ scale: artScale }] }}>
                      <RNAnimated.View style={artStyle}>
                        <ArtworkThumb
                          uri={track?.artwork}
                          size={artSize}
                          radius="lg"
                          placeholderIcon="disc"
                          accessibilityLabel={t('Album cover')}
                        />
                      </RNAnimated.View>
                    </RNAnimated.View>
                  ) : null}
                </View>
              </RNAnimated.View>
            </View>
          </GestureDetector>

          <RNAnimated.View pointerEvents={reconnecting ? 'none' : 'auto'} style={[styles.controls, { opacity: liveOpacity }]}>
            <View style={styles.info}>
              <View style={styles.titleRow}>
                <RNAnimated.View style={[styles.meta, { opacity: metaOpacity }]}>
                  <RNAnimated.View style={[styles.metaText, metaStyle]}>
                    <AppText variant="title" numberOfLines={2} accessibilityRole="header">
                      {track?.title ?? t('Nothing playing')}
                    </AppText>
                    {subtitle ? (
                      <AppText variant="body" tone="inkMuted" numberOfLines={1}>
                        {subtitle}
                      </AppText>
                    ) : null}
                  </RNAnimated.View>
                </RNAnimated.View>
                {canFavorite && track ? (
                  <FavoriteButton
                    favorite={state.currentFavorite}
                    onChange={commands.setFavorite}
                    style={FAVORITE_PULL}
                  />
                ) : null}
              </View>
              <AudioFormatBadges track={track} variant="line" onPress={() => setFormatVisible(true)} />
              <SeekBar
                playing={visible && state.isPlaying}
                onSeek={commands.seek}
                pendingLabel={commands.pendingLabel}
              />
            </View>
            <TransportControls
              spread
              isPlaying={state.isPlaying}
              playbackMode={state.playbackMode}
              pending={commands.pendingLabel !== null}
              onTogglePlayback={commands.togglePlayback}
              onPrevious={commands.previous}
              onNext={commands.next}
              onToggleShuffle={commands.toggleShuffle}
              onCycleRepeat={commands.cycleRepeat}
            />
            <VolumeRow volume={state.volume} onChange={commands.setVolume} />
            <NowPlayingFooter
              playerName={state.playerName}
              queueTotal={Math.max(state.queueTotal, state.queue.length)}
              onOpenConnection={openConnection}
              onOpenQueue={() => onAction({ type: 'OpenQueue' })}
            />
          </RNAnimated.View>
        </View>
        <AudioFormatSheet
          visible={formatVisible}
          track={track}
          transport={state.connectionTransport}
          onClose={() => setFormatVisible(false)}
        />
        <QueueSheet
          state={state}
          onAction={onAction}
          visible={state.screen.type === 'Queue'}
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
  dismissSurface: {
    flex: 1,
    minHeight: 0,
    marginBottom: Space.lg,
  },
  page: {
    flex: 1,
    paddingHorizontal: Space.xl,
  },
  handle: {
    marginBottom: Space.sm,
  },
  banner: {
    marginBottom: Space.md,
  },
  artArea: {
    flex: 1,
    minHeight: 0,
    paddingTop: ART_TOP_PADDING,
    alignItems: 'center',
  },
  controls: {
    gap: Space.lg,
  },
  info: {
    gap: Space.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.md,
  },
  meta: {
    flex: 1,
    minWidth: 0,
  },
  metaText: {
    gap: Space.xs,
  },
});
