import React, { useMemo } from 'react';
import { Animated, LayoutChangeEvent, Pressable, StyleSheet } from 'react-native';
import { RemoteAction, RemoteTrack, RemoteUiState } from '../../data/types';
import { between, CollapseProgress, fadeInOnCollapse, fadeOnCollapse } from '../collapse';
import { MiniProgressStyle, resolveMiniProgressStyle } from '../miniProgress';
import { usePalette } from '../PaletteProvider';
import { playbackFraction } from '../playbackTime';
import { useMiniProgressPreference } from '../preferences/useMiniProgressPreference';
import { Radius, Size, Space, Type } from '../tokens';
import { useOpacityTransition } from '../useOpacityTransition';
import { usePlayerCommands } from '../usePlayerCommands';
import { useTrackChangeMotion } from '../useTrackChangeMotion';
import { AppText } from './AppText';
import { ArtworkThumb } from './ArtworkThumb';
import { AudioFormatBadges } from './AudioFormatBadges';
import { CardComet } from './CardComet';
import { FavoriteButton } from './FavoriteButton';
import { IconButton } from './IconButton';
import { PLAY_BUTTON_RING_OUTSET, PlayButtonRing } from './PlayButtonRing';
import { SeekBar } from './SeekBar';
import { SLIDER_THUMB_OVERHANG } from './Slider';
import { TransportControls } from './TransportControls';
import { VolumeRow } from './VolumeRow';

export interface NowPlayingCardProps {
  state: RemoteUiState;
  track: RemoteTrack;
  onAction: (action: RemoteAction) => void;
  collapse: CollapseProgress;
  compact: boolean;
  dimmed?: boolean;
  onOpenNowPlaying: () => void;
  onOpenAudioFormat: () => void;
  onLayout?: (event: LayoutChangeEvent) => void;
}

const ART_EXPANDED = 120;
const ART_COLLAPSED = 48;
const ART_SCALE_COLLAPSED = ART_COLLAPSED / ART_EXPANDED;
const ART_OFFSET_COLLAPSED = (ART_COLLAPSED - ART_EXPANDED) / 2;
const EYEBROW_HEIGHT = 24;
const ALBUM_MAX_HEIGHT = Type.caption.lineHeight;
const BADGES_MAX_HEIGHT = 48;
const COMPACT_TRANSPORT_WIDTH = Size.controlMd * 3 + Space.xs * 2;
const TRANSPORT_ROW_HEIGHT = 72;
const ROW_GAP = 6;
const VOLUME_ROW_HEIGHT = 24;
const DIMMED_OPACITY = 0.45;
const DIM_DURATION = 250;
const SKIPPING_META_OPACITY = 0.5;
const EXPAND_ICON_SIZE = 18;
const META_GAP = 2;
const SEEK_MAX_HEIGHT = 60;

function useCollapseStyles(collapse: CollapseProgress, progressStyle: MiniProgressStyle) {
  return useMemo(() => {
    const fadeOut = fadeOnCollapse(collapse);
    const seekStays = progressStyle === 'bar';
    return {
      cardPadding: between(collapse, Space.lg, Space.md),
      eyebrow: { height: between(collapse, EYEBROW_HEIGHT, 0), marginBottom: between(collapse, Space.md, 0), opacity: fadeOut },
      mainGap: between(collapse, Space.lg, Space.md),
      artFrame: {
        width: between(collapse, ART_EXPANDED, ART_COLLAPSED),
        height: between(collapse, ART_EXPANDED, ART_COLLAPSED),
        borderRadius: between(collapse, Radius.lg, Radius.md),
      },
      artInner: {
        left: between(collapse, 0, ART_OFFSET_COLLAPSED),
        top: between(collapse, 0, ART_OFFSET_COLLAPSED),
        transform: [{ scale: between(collapse, 1, ART_SCALE_COLLAPSED) }],
      },
      album: { maxHeight: between(collapse, ALBUM_MAX_HEIGHT, 0), opacity: fadeOut },
      badges: { maxHeight: between(collapse, BADGES_MAX_HEIGHT, 0), marginTop: between(collapse, Space.xs, 0), opacity: fadeOut },
      favorite: { width: between(collapse, Size.controlMd, 0), opacity: fadeOut },
      compactTransport: { width: between(collapse, 0, COMPACT_TRANSPORT_WIDTH), opacity: fadeInOnCollapse(collapse) },
      seek: seekStays
        ? { marginTop: between(collapse, Space.md, Space.sm) }
        : { marginTop: between(collapse, Space.md, 0), maxHeight: between(collapse, SEEK_MAX_HEIGHT, 0), opacity: fadeOut },
      collapsedProgress: { opacity: fadeInOnCollapse(collapse) },
      transport: { marginTop: between(collapse, ROW_GAP, 0), height: between(collapse, TRANSPORT_ROW_HEIGHT, 0), opacity: fadeOut },
      volume: { marginTop: between(collapse, ROW_GAP, 0), height: between(collapse, VOLUME_ROW_HEIGHT, 0), opacity: fadeOut },
    };
  }, [collapse, progressStyle]);
}

export function NowPlayingCard({
  state,
  track,
  onAction,
  collapse,
  compact,
  dimmed = false,
  onOpenNowPlaying,
  onOpenAudioFormat,
  onLayout,
}: NowPlayingCardProps) {
  const palette = usePalette();
  const { preference } = useMiniProgressPreference();
  const progressStyle = resolveMiniProgressStyle(preference, state.playbackMode);
  const animated = useCollapseStyles(collapse, progressStyle);
  const seekStays = progressStyle === 'bar';
  const commands = usePlayerCommands(state, onAction);
  const { artStyle, metaStyle } = useTrackChangeMotion(track);
  const liveOpacity = useOpacityTransition(dimmed, DIMMED_OPACITY, DIM_DURATION);
  const metaOpacity = useOpacityTransition(commands.skipping, SKIPPING_META_OPACITY, DIM_DURATION);
  const canFavorite = state.supportedFeatures.includes('favorites_edit');
  const subtitle = track.artist || 'Unknown artist';
  const pending = commands.pendingLabel !== null;
  const progress = playbackFraction(state.positionMs, state.durationMs);
  const showCollapsedProgress = compact && !pending;

  const transportCallbacks = {
    onTogglePlayback: commands.togglePlayback,
    onPrevious: commands.previous,
    onNext: commands.next,
    pending,
  };

  return (
    <Animated.View pointerEvents={dimmed ? 'none' : 'box-none'} style={{ opacity: liveOpacity }}>
      <Animated.View
        onLayout={onLayout}
        style={[
          styles.card,
          {
            backgroundColor: palette.frost,
            borderColor: palette.outline,
            padding: animated.cardPadding,
          },
        ]}
      >
        <Animated.View style={[styles.eyebrowRow, animated.eyebrow]} pointerEvents={compact ? 'none' : 'box-none'}>
          <AppText variant="eyebrow" tone="accent" accessibilityRole="header">
            Now playing
          </AppText>
          <IconButton
            icon="expand"
            label="Open Now playing"
            size="sm"
            iconSize={EXPAND_ICON_SIZE}
            color={palette.inkMuted}
            onPress={onOpenNowPlaying}
            style={styles.expandButton}
          />
        </Animated.View>

        <Animated.View style={[styles.mainRow, { gap: animated.mainGap }]} pointerEvents="box-none">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open Now playing"
            onPress={onOpenNowPlaying}
            style={({ pressed }) => pressed && styles.artPressed}
          >
            <Animated.View style={[styles.artFrame, animated.artFrame]}>
              <Animated.View style={[styles.artInner, animated.artInner]}>
                <Animated.View style={artStyle}>
                  <ArtworkThumb uri={track.artwork} size={ART_EXPANDED} radius="lg" placeholderIcon="disc" />
                </Animated.View>
              </Animated.View>
            </Animated.View>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${track.title}, ${subtitle}`}
            onPress={onOpenNowPlaying}
            style={styles.meta}
          >
            <Animated.View style={[styles.metaText, { opacity: metaOpacity }]}>
              <Animated.View style={[styles.metaText, metaStyle]}>
                <AppText variant="headline" numberOfLines={compact ? 1 : 2}>
                  {track.title}
                </AppText>
                <AppText variant="body" tone="inkMuted" numberOfLines={1}>
                  {subtitle}
                </AppText>
              </Animated.View>
            </Animated.View>
            {track.album ? (
              <Animated.View style={[styles.clip, animated.album]}>
                <AppText variant="caption" tone="inkMuted" numberOfLines={1}>
                  {track.album}
                </AppText>
              </Animated.View>
            ) : null}
            <Animated.View style={[styles.clip, animated.badges]} pointerEvents={compact ? 'none' : 'auto'}>
              <AudioFormatBadges track={track} onPress={onOpenAudioFormat} />
            </Animated.View>
          </Pressable>

          <Animated.View style={[styles.clip, animated.favorite]} pointerEvents={compact ? 'none' : 'box-none'}>
            {canFavorite ? (
              <FavoriteButton favorite={state.currentFavorite} onChange={commands.setFavorite} />
            ) : null}
          </Animated.View>

          <Animated.View
            style={[styles.clip, styles.compactTransportFrame, animated.compactTransport]}
            pointerEvents={compact ? 'box-none' : 'none'}
          >
            <TransportControls
              variant="compact"
              isPlaying={state.isPlaying}
              {...transportCallbacks}
              playRing={
                showCollapsedProgress && progressStyle === 'ring' ? (
                  <PlayButtonRing track={track} progress={progress} playing={state.isPlaying} buttonSize={Size.controlMd} />
                ) : null
              }
              style={styles.compactTransport}
            />
          </Animated.View>
        </Animated.View>

        <Animated.View
          style={[styles.seekFrame, !seekStays && styles.clip, animated.seek]}
          pointerEvents={compact && !seekStays ? 'none' : 'box-none'}
        >
          <SeekBar
            positionMs={state.positionMs}
            durationMs={state.durationMs}
            playing={state.isPlaying}
            onSeek={commands.seek}
            pendingLabel={commands.pendingLabel}
            collapse={collapse}
          />
        </Animated.View>

        <Animated.View style={[styles.clip, animated.transport]} pointerEvents={compact ? 'none' : 'box-none'}>
          <TransportControls
            isPlaying={state.isPlaying}
            playbackMode={state.playbackMode}
            {...transportCallbacks}
            onToggleShuffle={commands.toggleShuffle}
            onCycleRepeat={commands.cycleRepeat}
            style={styles.fullTransport}
          />
        </Animated.View>

        <Animated.View style={[styles.clip, animated.volume]} pointerEvents={compact ? 'none' : 'box-none'}>
          <VolumeRow volume={state.volume} onChange={commands.setVolume} />
        </Animated.View>
      </Animated.View>
      {showCollapsedProgress && progressStyle === 'card' ? (
        <CardComet
          track={track}
          progress={progress}
          playing={state.isPlaying}
          radius={Radius.xl}
          style={animated.collapsedProgress}
        />
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: Radius.xl,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  expandButton: {
    marginRight: -Space.sm,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  artFrame: {
    overflow: 'hidden',
  },
  artInner: {
    position: 'absolute',
    width: ART_EXPANDED,
    height: ART_EXPANDED,
  },
  artPressed: {
    transform: [{ scale: 0.95 }],
  },
  meta: {
    flex: 1,
    minWidth: 0,
    gap: META_GAP,
  },
  metaText: {
    gap: META_GAP,
  },
  clip: {
    overflow: 'hidden',
  },
  seekFrame: {
    paddingHorizontal: SLIDER_THUMB_OVERHANG,
    marginHorizontal: -SLIDER_THUMB_OVERHANG,
  },
  compactTransportFrame: {
    paddingVertical: PLAY_BUTTON_RING_OUTSET,
    marginVertical: -PLAY_BUTTON_RING_OUTSET,
  },
  compactTransport: {
    width: COMPACT_TRANSPORT_WIDTH,
  },
  fullTransport: {
    height: TRANSPORT_ROW_HEIGHT,
  },
});
