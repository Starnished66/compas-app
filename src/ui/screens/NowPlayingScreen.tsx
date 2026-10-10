import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  LayoutChangeEvent,
  Modal,
  PanResponder,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
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

export interface NowPlayingScreenProps {
  state: RemoteUiState;
  onAction: (action: RemoteAction) => void;
  visible: boolean;
  onClose: () => void;
}

const CLOSE_VELOCITY = 0.8;
const PAUSED_ART_SCALE = 0.88;
const DIMMED_OPACITY = 0.45;
const DIM_DURATION = 250;
const SKIPPING_META_OPACITY = 0.5;
const FAVORITE_EDGE_PULL = 10;
const FAVORITE_PULL = { marginTop: -Space.sm, marginRight: -FAVORITE_EDGE_PULL };
const ART_TOP_PADDING = Space.sm;

export function NowPlayingScreen({ state, onAction, visible, onClose }: NowPlayingScreenProps) {
  const reducedMotion = useReducedMotion();
  const insets = useScreenInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const [formatVisible, setFormatVisible] = useState(false);
  const [artArea, setArtArea] = useState({ width: 0, height: 0 });
  const offset = useRef(new Animated.Value(windowHeight)).current;
  const artScale = useRef(new Animated.Value(state.isPlaying ? 1 : PAUSED_ART_SCALE)).current;
  const latest = useRef({ onClose, reducedMotion });
  latest.current = { onClose, reducedMotion };

  const track = state.currentTrack;
  const reconnecting = isReconnecting(state);
  const commands = usePlayerCommands(state, onAction);
  const { artStyle, metaStyle } = useTrackChangeMotion(track);
  const liveOpacity = useOpacityTransition(reconnecting, DIMMED_OPACITY, DIM_DURATION);
  const metaOpacity = useOpacityTransition(commands.skipping, SKIPPING_META_OPACITY, DIM_DURATION);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      offset.setValue(windowHeight);
      const opening = Animated.timing(offset, {
        toValue: 0,
        duration: motionDuration(reducedMotion, Durations.nowPlayingOpen),
        easing: Easings.standard,
        useNativeDriver: true,
      });
      opening.start();
      return () => opening.stop();
    }
    const closing = Animated.timing(offset, {
      toValue: windowHeight,
      duration: motionDuration(reducedMotion, Durations.nowPlayingClose),
      easing: Easings.exit,
      useNativeDriver: true,
    });
    closing.start(({ finished }) => {
      if (finished) setMounted(false);
    });
    return () => closing.stop();
  }, [offset, visible]);

  useEffect(() => {
    const animation = Animated.timing(artScale, {
      toValue: state.isPlaying ? 1 : PAUSED_ART_SCALE,
      duration: motionDuration(reducedMotion, Durations.artPaused),
      easing: Easings.standard,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [artScale, reducedMotion, state.isPlaying]);

  const createDismissResponder = (closeOnTap: boolean) =>
    PanResponder.create({
      // RN's Modal claims every unclaimed touch start, after which its descendants can no longer take over a move.
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: (_, gesture) => gesture.dy > Math.abs(gesture.dx) && gesture.dy > Space.sm,
      onPanResponderMove: (_, gesture) => offset.setValue(Math.max(0, gesture.dy)),
      onPanResponderRelease: (_, gesture) => {
        const distance = Math.max(0, gesture.dy);
        const tapped = closeOnTap && distance < Distances.sheetTap && Math.abs(gesture.dx) < Distances.sheetTap;
        if (tapped || distance > Distances.nowPlayingClose || gesture.vy > CLOSE_VELOCITY) {
          latest.current.onClose();
          return;
        }
        settleBack();
      },
      onPanResponderTerminate: () => settleBack(),
    });
  const screenResponder = useRef(createDismissResponder(false)).current;
  const handleResponder = useRef(createDismissResponder(true)).current;

  function settleBack() {
    Animated.timing(offset, {
      toValue: 0,
      duration: motionDuration(latest.current.reducedMotion, Durations.nowPlayingSnapBack),
      easing: Easings.standard,
      useNativeDriver: true,
    }).start();
  }

  if (!mounted) return null;

  const openConnection = () => {
    onClose();
    onAction({ type: 'OpenConnection' });
  };

  const artSize = Math.max(0, Math.min(artArea.width, artArea.height - ART_TOP_PADDING));
  const subtitle = track ? [track.artist || 'Unknown artist', track.album].filter(Boolean).join(' · ') : '';
  const canFavorite = state.supportedFeatures.includes('favorites_edit');

  const onArtAreaLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setArtArea((previous) => (previous.width === width && previous.height === height ? previous : { width, height }));
  };

  return (
    <Modal transparent statusBarTranslucent animationType="none" visible onRequestClose={onClose}>
      <Animated.View
        accessibilityViewIsModal
        accessibilityLabel="Now playing"
        style={[styles.root, { transform: [{ translateY: offset }] }]}
      >
        <AppBackdrop artworkUri={track?.artwork} />
        <View
          collapsable={false}
          style={[styles.page, { paddingTop: insets.top, paddingBottom: Space.xl + insetBeyond(insets.bottom, Space.xl) }]}
          {...screenResponder.panHandlers}
        >
          <SheetHandle
            label="Close Now playing"
            onClose={onClose}
            dragHandlers={handleResponder.panHandlers}
            style={styles.handle}
          />
          {reconnecting ? (
            <EnterView from="down" style={styles.banner}>
              <ReconnectBanner playerName={state.playerName} />
            </EnterView>
          ) : null}
          <Animated.View pointerEvents={reconnecting ? 'none' : 'auto'} style={[styles.body, { opacity: liveOpacity }]}>
            <View style={styles.artArea} onLayout={onArtAreaLayout}>
              {artSize > 0 ? (
                <Animated.View style={{ transform: [{ scale: artScale }] }}>
                  <Animated.View style={artStyle}>
                    <ArtworkThumb
                      uri={track?.artwork}
                      size={artSize}
                      radius="lg"
                      placeholderIcon="disc"
                      accessibilityLabel="Album cover"
                    />
                  </Animated.View>
                </Animated.View>
              ) : null}
            </View>

            <View style={styles.controls}>
              <View style={styles.info}>
                <View style={styles.titleRow}>
                  <Animated.View style={[styles.meta, { opacity: metaOpacity }]}>
                    <Animated.View style={[styles.metaText, metaStyle]}>
                      <AppText variant="title" numberOfLines={2} accessibilityRole="header">
                        {track?.title ?? 'Nothing playing'}
                      </AppText>
                      {subtitle ? (
                        <AppText variant="body" tone="inkMuted" numberOfLines={1}>
                          {subtitle}
                        </AppText>
                      ) : null}
                    </Animated.View>
                  </Animated.View>
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
                  positionMs={state.positionMs}
                  durationMs={state.durationMs}
                  playing={state.isPlaying}
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
            </View>
          </Animated.View>
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
        <SnackbarHost bottomOffset={Space.lg + insetBeyond(insets.bottom, Space.lg)} active={visible} />
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
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
  body: {
    flex: 1,
    minHeight: 0,
    justifyContent: 'space-between',
    gap: Space.lg,
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
