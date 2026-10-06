import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import {
  RemoteUiState,
  RemoteAction,
  ConnectionStatus,
  PlaybackMode,
  RemoteTrack,
} from '../../data/types';
import { ColorScheme } from '../theme';
import { CardSurface } from '../components/CardSurface';
import { Artwork } from '../components/Artwork';
import { SlimSlider } from '../components/SlimSlider';
import { Glyph } from '../components/Glyph';

export interface HomeScreenProps {
  state: RemoteUiState;
  colors: ColorScheme;
  onAction: (action: RemoteAction) => Unit;
}

type Unit = void;

function formatTime(ms: number): string {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function statusColor(status: ConnectionStatus): string {
  switch (status) {
    case ConnectionStatus.Connected:
      return '#8DBB50';
    case ConnectionStatus.Connecting:
      return '#E5B65B';
    case ConnectionStatus.Disconnected:
      return '#9CA0A6';
    case ConnectionStatus.Error:
      return '#E06C62';
  }
}

function connectionLabel(status: ConnectionStatus): string {
  switch (status) {
    case ConnectionStatus.Connected:
      return 'Connected';
    case ConnectionStatus.Connecting:
      return 'Connecting…';
    case ConnectionStatus.Disconnected:
      return 'Not connected';
    case ConnectionStatus.Error:
      return 'Connection failed';
  }
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ state, colors, onAction }) => {
  const { width } = useWindowDimensions();
  const isCompact = width < 360;
  const isTablet = width >= 700;
  const track = state.currentTrack;

  const [isSeeking, setIsSeeking] = useState(false);
  const [seekPos, setSeekPos] = useState(state.positionMs);
  const [isAdjustingVol, setIsAdjustingVol] = useState(false);
  const [volLevel, setVolLevel] = useState(state.volume);

  const duration = Math.max(1, state.durationMs);
  const currentPos = isSeeking ? seekPos : state.positionMs;
  const currentVol = isAdjustingVol ? volLevel : state.volume;

  // Build audio details badges
  const audioDetails: string[] = [];
  if (track?.codec) audioDetails.push(track.codec);
  if (track?.sourceBitDepth && track.sourceBitDepth > 0) {
    audioDetails.push(`${track.sourceBitDepth}-bit`);
  }
  if (track?.sourceSampleRateHz && track.sourceSampleRateHz > 0) {
    const hz = track.sourceSampleRateHz;
    audioDetails.push(hz % 1000 === 0 ? `${hz / 1000} kHz` : `${(hz / 1000).toFixed(1)} kHz`);
  }

  const shuffleActive = state.playbackMode === PlaybackMode.Shuffle;
  const repeatActive =
    state.playbackMode === PlaybackMode.RepeatAll || state.playbackMode === PlaybackMode.RepeatOne;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: 'transparent' }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Connection notice when disconnected */}
      {state.connectionStatus !== ConnectionStatus.Connected && !track && (
        <CardSurface colors={colors} style={styles.noticeCard}>
          <TouchableOpacity
            style={styles.noticeRow}
            onPress={() => onAction({ type: 'OpenConnection' })}
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.statusDot,
                { backgroundColor: statusColor(state.connectionStatus) },
              ]}
            />
            <View style={styles.noticeTextContainer}>
              <Text style={[styles.noticeTitle, { color: colors.onSurface }]}>
                {connectionLabel(state.connectionStatus)}
              </Text>
              <Text
                style={[styles.noticeSubtitle, { color: colors.onSurfaceVariant }]}
                numberOfLines={1}
              >
                {state.connectionMessage || 'Tap to connect to a player'}
              </Text>
            </View>
            <Text style={[styles.chevron, { color: colors.primary }]}>›</Text>
          </TouchableOpacity>
        </CardSurface>
      )}

      {/* Hero Now Playing Card */}
      <CardSurface colors={colors} style={styles.heroCard} backdropUri={track?.artwork}>
        {!track ? (
          <View style={styles.emptyContainer}>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>
              NOW PLAYING
            </Text>
            <Text
              style={[styles.emptyMessage, { color: colors.onSurfaceVariant }]}
            >
              {state.connectionStatus === ConnectionStatus.Connected
                ? 'Nothing playing'
                : 'Connect to your player to control playback'}
            </Text>
            <TouchableOpacity
              style={[styles.connectButton, { backgroundColor: colors.primary }]}
              onPress={() => onAction({ type: 'OpenConnection' })}
            >
              <Text style={[styles.connectButtonText, { color: colors.onPrimary }]}>
                Connect to player
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={isTablet && styles.tabletHeroLayout}>
            {isTablet && (
              <Artwork
                uri={track.artwork}
                colors={colors}
                size={Math.min(300, Math.round(width * 0.28))}
                borderRadius={20}
              />
            )}
            <View style={isTablet && styles.tabletHeroDetails}>
            {/* Top metadata row with artwork */}
            <View style={styles.metaRow}>
              {!isTablet && (
                <Artwork
                  uri={track.artwork}
                  colors={colors}
                  size={isCompact ? 100 : 120}
                  borderRadius={16}
                />
              )}
              <View style={styles.trackDetails}>
                <View style={styles.eyebrowRow}>
                  <Text style={[styles.eyebrow, { color: colors.primary }]}>
                    NOW PLAYING
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                    {state.supportedFeatures.includes('favorites_edit') && (
                      <TouchableOpacity
                        onPress={() => onAction({ type: 'SetCurrentFavorite', favorite: !state.currentFavorite })}
                        accessibilityRole="button"
                        accessibilityLabel={state.currentFavorite ? 'Remove current track from Favorites' : 'Add current track to Favorites'}
                      >
                        <Glyph name={state.currentFavorite ? 'heartFill' : 'heart'} size={20} tint={colors.primary} />
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      onPress={() => onAction({ type: 'OpenQueue' })}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Glyph name="moreVertical" size={18} tint={colors.onSurfaceVariant} />
                    </TouchableOpacity>
                  </View>
                </View>

                <Text
                  style={[styles.trackTitle, { color: colors.onSurface }]}
                  numberOfLines={2}
                >
                  {track.title}
                </Text>
                <Text
                  style={[styles.trackArtist, { color: colors.onSurfaceVariant }]}
                  numberOfLines={1}
                >
                  {track.artist || 'Unknown artist'}
                </Text>
                {!!track.album && (
                  <Text
                    style={[styles.trackAlbum, { color: colors.onSurfaceVariant }]}
                    numberOfLines={1}
                  >
                    {track.album}
                  </Text>
                )}

                {/* Badges */}
                {audioDetails.length > 0 && (
                  <View style={styles.badgeRow}>
                    {audioDetails.map((b, idx) => (
                      <View
                        key={idx}
                        style={[
                          styles.badge,
                          {
                            backgroundColor: colors.surfaceContainerHighest,
                            borderColor: colors.outline,
                          },
                        ]}
                      >
                        <Text style={[styles.badgeText, { color: colors.onSurfaceVariant }]}>
                          {b}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </View>

            {/* Seek Bar */}
            <View style={styles.sliderContainer}>
              <SlimSlider
                value={currentPos}
                min={0}
                max={duration}
                enabled={state.durationMs > 0}
                activeColor={colors.primary}
                inactiveColor={colors.surfaceContainerHighest}
                thumbColor={colors.primary}
                onValueChange={(val) => {
                  setIsSeeking(true);
                  setSeekPos(val);
                }}
                onSlidingComplete={(val) => {
                  onAction({ type: 'SeekTo', positionMs: Math.round(val) });
                  setIsSeeking(false);
                }}
              />
              <View style={styles.timeRow}>
                <Text style={[styles.timeText, { color: colors.onSurfaceVariant }]}>
                  {formatTime(currentPos)}
                </Text>
                <Text style={[styles.timeText, { color: colors.onSurfaceVariant }]}>
                  {formatTime(state.durationMs)}
                </Text>
              </View>
            </View>

            {/* Transport Controls */}
            <View style={[styles.transportRow, isTablet && styles.tabletTransportRow]}>
              <TouchableOpacity
                style={[
                  styles.transportButton,
                  { backgroundColor: colors.surfaceContainer },
                ]}
                onPress={() => onAction({ type: 'ToggleShuffle' })}
              >
                <Glyph
                  name="shuffle"
                  size={20}
                  tint={shuffleActive ? colors.primary : colors.onSurface}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.transportButton,
                  { backgroundColor: colors.surfaceContainer },
                ]}
                onPress={() => onAction({ type: 'Previous' })}
              >
                <Glyph name="previous" size={20} tint={colors.onSurface} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.playButton,
                  { backgroundColor: colors.primary },
                ]}
                onPress={() => onAction({ type: 'TogglePlayback' })}
              >
                <Glyph
                  name={state.isPlaying ? 'pause' : 'play'}
                  size={28}
                  tint={colors.onPrimary}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.transportButton,
                  { backgroundColor: colors.surfaceContainer },
                ]}
                onPress={() => onAction({ type: 'Next' })}
              >
                <Glyph name="next" size={20} tint={colors.onSurface} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.transportButton,
                  { backgroundColor: colors.surfaceContainer },
                ]}
                onPress={() => onAction({ type: 'CycleRepeatMode' })}
              >
                <Glyph
                  name={state.playbackMode === PlaybackMode.RepeatOne ? 'repeatone' : 'repeat'}
                  size={20}
                  tint={repeatActive ? colors.primary : colors.onSurface}
                />
              </TouchableOpacity>
            </View>

            {/* Volume Slider */}
            <View style={styles.volumeRow}>
              <Glyph name="volume" size={18} tint={colors.onSurfaceVariant} />
              <View style={styles.volumeSliderContainer}>
                <SlimSlider
                  value={currentVol}
                  min={0}
                  max={1}
                  activeColor={colors.primary}
                  inactiveColor={colors.surfaceContainerHighest}
                  thumbColor={colors.primary}
                  onValueChange={(v) => {
                    setIsAdjustingVol(true);
                    setVolLevel(v);
                  }}
                  onSlidingComplete={(v) => {
                    onAction({ type: 'SetVolume', volume: v });
                    setIsAdjustingVol(false);
                  }}
                />
              </View>
              <Text style={[styles.volumeText, { color: colors.onSurfaceVariant }]}>
                {Math.round(currentVol * 100)}%
              </Text>
            </View>
            </View>
          </View>
        )}
      </CardSurface>

      {/* Queue Preview Card */}
      <CardSurface colors={colors} style={styles.queueCard}>
        <View style={styles.queueHeader}>
          <View style={styles.queueHeaderLeft}>
            <Text style={[styles.queueTitle, { color: colors.onSurface }]}>
              Up Next
            </Text>
            <Text style={[styles.queueCount, { color: colors.onSurfaceVariant }]}>
              {' · '}
              {Math.min(3, state.queue.length)} tracks
            </Text>
          </View>
          <TouchableOpacity
            style={styles.seeAllButton}
            onPress={() => onAction({ type: 'OpenQueue' })}
          >
            <Text style={[styles.seeAllText, { color: colors.primary }]}>
              See all ›
            </Text>
          </TouchableOpacity>
        </View>

        {state.queue.length === 0 ? (
          <Text style={[styles.emptyQueueText, { color: colors.onSurfaceVariant }]}>
            Your queue is empty
          </Text>
        ) : (
          state.queue.slice(0, 3).map((item, index) => (
            <View
              key={item.id || index}
              style={[
                styles.queueItem,
                index < 2 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.outline },
              ]}
            >
              <Artwork
                uri={item.artwork}
                colors={colors}
                size={36}
                borderRadius={6}
              />
              <View style={styles.queueItemInfo}>
                <Text
                  style={[styles.queueItemTitle, { color: colors.onSurface }]}
                  numberOfLines={1}
                >
                  {item.title}
                </Text>
                <Text
                  style={[styles.queueItemArtist, { color: colors.onSurfaceVariant }]}
                  numberOfLines={1}
                >
                  {item.artist || 'Unknown artist'}
                </Text>
              </View>
              {item.duration ? (
                <Text style={[styles.queueItemDuration, { color: colors.onSurfaceVariant }]}>
                  {item.duration}
                </Text>
              ) : null}
            </View>
          ))
        )}
      </CardSurface>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 12,
    paddingBottom: 40,
  },
  noticeCard: {
    padding: 0,
  },
  noticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 12,
  },
  noticeTextContainer: {
    flex: 1,
  },
  noticeTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  noticeSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  chevron: {
    fontSize: 22,
    fontWeight: '300',
  },
  heroCard: {
    padding: 16,
  },
  emptyContainer: {
    paddingVertical: 20,
    alignItems: 'flex-start',
  },
  emptyMessage: {
    fontSize: 14,
    marginTop: 8,
    marginBottom: 20,
  },
  connectButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
  },
  connectButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    gap: 16,
  },
  tabletHeroLayout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 28,
  },
  tabletHeroDetails: {
    flex: 1,
    minWidth: 0,
  },
  trackDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  eyebrowRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  trackTitle: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 22,
  },
  trackArtist: {
    fontSize: 14,
    marginTop: 4,
  },
  trackAlbum: {
    fontSize: 12,
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 8,
  },
  badge: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '500',
  },
  sliderContainer: {
    marginTop: 14,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -4,
  },
  timeText: {
    fontSize: 11,
  },
  transportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  tabletTransportRow: {
    width: '100%',
    maxWidth: 500,
    alignSelf: 'center',
  },
  transportButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  volumeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
  },
  volumeSliderContainer: {
    flex: 1,
  },
  volumeText: {
    fontSize: 11,
    width: 34,
    textAlign: 'right',
  },
  queueCard: {
    padding: 16,
  },
  queueHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  queueHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  queueTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  queueCount: {
    fontSize: 13,
  },
  seeAllButton: {
    padding: 4,
  },
  seeAllText: {
    fontSize: 13,
    fontWeight: '600',
  },
  emptyQueueText: {
    fontSize: 13,
    paddingVertical: 12,
  },
  queueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
  },
  queueItemInfo: {
    flex: 1,
  },
  queueItemTitle: {
    fontSize: 14,
    fontWeight: '500',
  },
  queueItemArtist: {
    fontSize: 12,
    marginTop: 2,
  },
  queueItemDuration: {
    fontSize: 12,
  },
});
