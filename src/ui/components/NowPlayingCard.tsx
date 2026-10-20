import React from 'react';
import { Animated, LayoutChangeEvent, Pressable, StyleSheet } from 'react-native';
import Reanimated from 'react-native-reanimated';
import { RemoteAction, RemoteTrack, RemoteUiState } from '../../data/types';
import { CollapseProgress } from '../collapse';
import { resolveMiniProgressStyle } from '../miniProgress';
import { usePalette } from '../PaletteProvider';
import { useMiniProgressPreference } from '../preferences/useMiniProgressPreference';
import { Radius, Size, Space } from '../tokens';
import { useOpacityTransition } from '../useOpacityTransition';
import { usePlayerCommands } from '../usePlayerCommands';
import { useTrackChangeMotion } from '../useTrackChangeMotion';
import {
  COMPACT_TRANSPORT_WIDTH,
  NOW_PLAYING_ART_SIZE,
  TRANSPORT_ROW_HEIGHT,
  useNowPlayingCardCollapse,
} from '../useNowPlayingCardCollapse';
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
import { useI18n } from '../../i18n';

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

const DIMMED_OPACITY = 0.45;
const DIM_DURATION = 250;
const SKIPPING_META_OPACITY = 0.5;
const EXPAND_ICON_SIZE = 18;
const META_GAP = 2;

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
  const { t } = useI18n();
  const palette = usePalette();
  const { preference } = useMiniProgressPreference();
  const progressStyle = resolveMiniProgressStyle(preference, state.playbackMode);
  const seekStays = progressStyle === 'bar';
  const animated = useNowPlayingCardCollapse(collapse, seekStays);
  const commands = usePlayerCommands(state, onAction);
  const { artStyle, metaStyle } = useTrackChangeMotion(track);
  const liveOpacity = useOpacityTransition(dimmed, DIMMED_OPACITY, DIM_DURATION);
  const metaOpacity = useOpacityTransition(commands.skipping, SKIPPING_META_OPACITY, DIM_DURATION);
  const canFavorite = state.supportedFeatures.includes('favorites_edit');
  const subtitle = track.artist || t('Unknown artist');
  const pending = commands.pendingLabel !== null;
  const showCollapsedProgress = compact && !pending;

  const transportCallbacks = {
    onTogglePlayback: commands.togglePlayback,
    onPrevious: commands.previous,
    onNext: commands.next,
    pending,
  };

  return (
    <Animated.View pointerEvents={dimmed ? 'none' : 'box-none'} style={{ opacity: liveOpacity }}>
      <Reanimated.View
        onLayout={onLayout}
        style={[
          styles.card,
          {
            backgroundColor: palette.frost,
            borderColor: palette.outline,
          },
          animated.card,
        ]}
      >
        <Reanimated.View style={[styles.eyebrowRow, animated.eyebrow]} pointerEvents={compact ? 'none' : 'box-none'}>
          <AppText variant="eyebrow" tone="accent" accessibilityRole="header">
            {t('Now playing')}
          </AppText>
          <IconButton
            icon="expand"
            label={t('Open Now playing')}
            size="sm"
            iconSize={EXPAND_ICON_SIZE}
            color={palette.inkMuted}
            onPress={onOpenNowPlaying}
            style={styles.expandButton}
          />
        </Reanimated.View>

        <Reanimated.View style={[styles.mainRow, animated.mainRow]} pointerEvents="box-none">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Open Now playing')}
            onPress={onOpenNowPlaying}
            style={({ pressed }) => pressed && styles.artPressed}
          >
            <Reanimated.View style={[styles.artFrame, animated.artFrame]}>
              <Reanimated.View style={[styles.artInner, animated.artInner]}>
                <Animated.View style={artStyle}>
                  <ArtworkThumb uri={track.artwork} size={NOW_PLAYING_ART_SIZE} radius="lg" placeholderIcon="disc" />
                </Animated.View>
              </Reanimated.View>
            </Reanimated.View>
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
              <Reanimated.View style={[styles.clip, animated.album]}>
                <AppText variant="caption" tone="inkMuted" numberOfLines={1}>
                  {track.album}
                </AppText>
              </Reanimated.View>
            ) : null}
            <Reanimated.View style={[styles.clip, animated.badges]} pointerEvents={compact ? 'none' : 'auto'}>
              <AudioFormatBadges track={track} onPress={onOpenAudioFormat} />
            </Reanimated.View>
          </Pressable>

          <Reanimated.View style={[styles.clip, animated.favorite]} pointerEvents={compact ? 'none' : 'box-none'}>
            {canFavorite ? (
              <FavoriteButton favorite={state.currentFavorite} onChange={commands.setFavorite} />
            ) : null}
          </Reanimated.View>

          <Reanimated.View
            style={[styles.clip, styles.compactTransportFrame, animated.compactTransport]}
            pointerEvents={compact ? 'box-none' : 'none'}
          >
            <TransportControls
              variant="compact"
              isPlaying={state.isPlaying}
              {...transportCallbacks}
              playRing={
                showCollapsedProgress && progressStyle === 'ring' ? (
                  <PlayButtonRing track={track} playing={state.isPlaying} buttonSize={Size.controlMd} />
                ) : null
              }
              style={styles.compactTransport}
            />
          </Reanimated.View>
        </Reanimated.View>

        <Reanimated.View
          style={[styles.seekFrame, !seekStays && styles.clip, animated.seek]}
          pointerEvents={compact && !seekStays ? 'none' : 'box-none'}
        >
          <SeekBar
            playing={state.isPlaying}
            onSeek={commands.seek}
            pendingLabel={commands.pendingLabel}
            collapse={collapse}
          />
        </Reanimated.View>

        <Reanimated.View style={[styles.clip, animated.transport]} pointerEvents={compact ? 'none' : 'box-none'}>
          <TransportControls
            isPlaying={state.isPlaying}
            playbackMode={state.playbackMode}
            {...transportCallbacks}
            onToggleShuffle={commands.toggleShuffle}
            onCycleRepeat={commands.cycleRepeat}
            style={styles.fullTransport}
          />
        </Reanimated.View>

        <Reanimated.View style={[styles.clip, animated.volume]} pointerEvents={compact ? 'none' : 'box-none'}>
          <VolumeRow volume={state.volume} onChange={commands.setVolume} />
        </Reanimated.View>
      </Reanimated.View>
      {showCollapsedProgress && progressStyle === 'card' ? (
        <CardComet
          track={track}
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
    width: NOW_PLAYING_ART_SIZE,
    height: NOW_PLAYING_ART_SIZE,
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
