import React from 'react';
import { Animated as RNAnimated, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import type { useI18n } from '../../i18n';
import type { RemoteTrack } from '../../data/types';
import { AppText } from '../components/AppText';
import { ArtworkThumb } from '../components/ArtworkThumb';
import { AudioFormatBadges } from '../components/AudioFormatBadges';
import { EnterView } from '../components/EnterView';
import { FavoriteButton } from '../components/FavoriteButton';
import { IconButton } from '../components/IconButton';
import { NowPlayingFooter } from '../components/NowPlayingFooter';
import { ReconnectBanner } from '../components/ReconnectBanner';
import { SeekBar } from '../components/SeekBar';
import { SheetHandle } from '../components/SheetHandle';
import { TransportControls } from '../components/TransportControls';
import { VolumeRow } from '../components/VolumeRow';
import { StarRating } from '../components/StarRating';
import type { useTrackChangeMotion } from '../useTrackChangeMotion';
import type { usePlayerCommands } from '../usePlayerCommands';
import type { useOpacityTransition } from '../useOpacityTransition';
import type { useNowPlayingDismissGesture } from './useNowPlayingDismissGesture';
import type { NowPlayingScreenProps } from './NowPlayingScreen';
import { Space } from '../tokens';

const FAVORITE_EDGE_PULL = 10;
const FAVORITE_PULL = { marginTop: -Space.sm, marginRight: -FAVORITE_EDGE_PULL };
const ART_TOP_PADDING = Space.sm;

type Translate = ReturnType<typeof useI18n>['t'];
type Opacity = ReturnType<typeof useOpacityTransition>;
type TrackMotion = ReturnType<typeof useTrackChangeMotion>;
type ArtArea = { width: number; height: number };

interface ArtworkPanelOptions {
  panGesture: ReturnType<typeof useNowPlayingDismissGesture>['panGesture'];
  onClose: () => void;
  reconnecting: boolean;
  playerName: string;
  liveOpacity: Opacity;
  artArea: ArtArea;
  setArtArea: React.Dispatch<React.SetStateAction<ArtArea>>;
  artScale: RNAnimated.Value;
  artStyle: TrackMotion['artStyle'];
  artwork: RemoteTrack['artwork'];
  t: Translate;
}

export function renderNowPlayingArtworkPanel({
  panGesture, onClose, reconnecting, playerName, liveOpacity, artArea, setArtArea, artScale, artStyle, artwork, t,
}: ArtworkPanelOptions) {
  const artSize = Math.max(0, Math.min(artArea.width, artArea.height - ART_TOP_PADDING));
  const onArtAreaLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setArtArea((previous) => (previous.width === width && previous.height === height ? previous : { width, height }));
  };

  return (
    <GestureDetector gesture={panGesture}>
      <View style={styles.dismissSurface}>
        <SheetHandle label={t('Close Now playing')} onClose={onClose} onPress={onClose} style={styles.handle} />
        {reconnecting ? (
          <EnterView from="down" style={styles.banner}>
            <ReconnectBanner playerName={playerName} />
          </EnterView>
        ) : null}
        <RNAnimated.View pointerEvents={reconnecting ? 'none' : 'auto'} style={{ flex: 1, opacity: liveOpacity }}>
          <View style={styles.artArea} onLayout={onArtAreaLayout}>
            {artSize > 0 ? (
              <RNAnimated.View style={{ transform: [{ scale: artScale }] }}>
                <RNAnimated.View style={artStyle}>
                  <ArtworkThumb
                    uri={artwork}
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
  );
}

interface ControlsOptions {
  state: Omit<NowPlayingScreenProps, 'visible' | 'queueOpen' | 'onAction' | 'onClose'>;
  onAction: NowPlayingScreenProps['onAction'];
  visible: boolean;
  reconnecting: boolean;
  liveOpacity: Opacity;
  metaOpacity: Opacity;
  metaStyle: TrackMotion['metaStyle'];
  shown: RemoteTrack | null | undefined;
  track: RemoteTrack | null | undefined;
  commands: ReturnType<typeof usePlayerCommands>;
  showFormat: () => void;
  showTrackMenu?: () => void;
  onClose: () => void;
  t: Translate;
}

function renderTrackInfo({ state, visible, metaOpacity, metaStyle, shown, track, commands, showFormat, showTrackMenu, t }: ControlsOptions) {
  const subtitle = shown ? [shown.artist || t('Unknown artist'), shown.album].filter(Boolean).join(' · ') : '';
  const canRate = state.supportedFeatures.includes('ratings_edit');
  const canFavorite = state.supportedFeatures.includes('favorites_edit');
  const canJump = Boolean(showTrackMenu && (track?.album || track?.artist));

  return (
    <View style={styles.info}>
      <View style={styles.titleRow}>
        <RNAnimated.View style={[styles.meta, { opacity: metaOpacity }]}>
          <RNAnimated.View style={[styles.metaText, metaStyle]}>
            <AppText variant="title" numberOfLines={2} accessibilityRole="header">
              {shown?.title ?? t('Nothing playing')}
            </AppText>
            {subtitle ? (
              <AppText variant="body" tone="inkMuted" numberOfLines={1}>
                {subtitle}
              </AppText>
            ) : null}
          </RNAnimated.View>
        </RNAnimated.View>
        {canJump ? (
          <IconButton
            icon="moreHorizontal"
            label={t('More options')}
            size="sm"
            onPress={showTrackMenu}
          />
        ) : null}
        {!canRate && canFavorite && track ? (
          <FavoriteButton
            rating={commands.displayedRating}
            onChange={commands.setRating}
            disabled={commands.disabled}
            style={FAVORITE_PULL}
          />
        ) : null}
      </View>
      {canRate && track?.title ? (
        <StarRating rating={commands.displayedRating} onChange={commands.setRating}
          disabled={commands.disabled} style={styles.rating} />
      ) : null}
      <AudioFormatBadges track={track} variant="line" onPress={showFormat} />
      <SeekBar
        playing={visible && state.isPlaying}
        onSeek={commands.seek}
        disabled={commands.disabled}
        pendingLabel={commands.pendingLabel}
      />
    </View>
  );
}

export function renderNowPlayingControls(options: ControlsOptions) {
  const { state, onAction, onClose, reconnecting, liveOpacity, commands } = options;
  const openConnection = () => {
    onClose();
    onAction({ type: 'OpenConnection' });
  };

  return (
    <RNAnimated.View pointerEvents={reconnecting ? 'none' : 'auto'} style={[styles.controls, { opacity: liveOpacity }]}>
      {renderTrackInfo(options)}
      <TransportControls
        spread
        isPlaying={state.isPlaying}
        playbackMode={state.playbackMode}
        pending={commands.pendingLabel !== null}
        disabled={commands.disabled}
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
  );
}

const styles = StyleSheet.create({
  dismissSurface: {
    flex: 1,
    minHeight: 0,
    marginBottom: Space.lg,
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
  rating: { alignSelf: 'flex-end' },
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
