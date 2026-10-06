import React, { useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Alert,
} from 'react-native';
import {
  RemoteUiState,
  RemoteAction,
  ContentStatus,
  RemoteTrack,
} from '../../data/types';
import { ColorScheme } from '../theme';
import { CardSurface } from '../components/CardSurface';
import { Artwork } from '../components/Artwork';
import { Glyph } from '../components/Glyph';

export interface QueueScreenProps {
  state: RemoteUiState;
  colors: ColorScheme;
  onAction: (action: RemoteAction) => void;
}

const QueueScreenContent: React.FC<QueueScreenProps> = ({
  state,
  colors,
  onAction,
}) => {
  const lastPageRequest = useRef('');
  const scrollPosition = useRef({ offset: 0, viewport: 0, content: 0 });
  const loadNearEnd = (offset: number, viewport: number, content: number) => {
    if (!viewport || offset + viewport < content - 480) {
      lastPageRequest.current = '';
      return;
    }
    const key = `${state.queue.length}:${state.queueTotal}`;
    if (state.queueHasMore && !state.queueLoadingMore && lastPageRequest.current !== key) {
      lastPageRequest.current = key;
      onAction({ type: 'LoadMoreQueue' });
    }
  };
  const handleScroll = ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
    const position = {
      offset: nativeEvent.contentOffset.y,
      viewport: nativeEvent.layoutMeasurement.height,
      content: nativeEvent.contentSize.height,
    };
    scrollPosition.current = position;
    loadNearEnd(position.offset, position.viewport, position.content);
  };
  return (
    <ScrollView
      style={[styles.container, { backgroundColor: 'transparent' }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={200}
      onScroll={handleScroll}
      onScrollEndDrag={handleScroll}
      onMomentumScrollEnd={handleScroll}
      onContentSizeChange={(_, content) => {
        scrollPosition.current.content = content;
        const { offset, viewport } = scrollPosition.current;
        loadNearEnd(offset, viewport, content);
      }}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.backButton, { borderColor: colors.outline }]}
          onPress={() => onAction({ type: 'Back' })}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Glyph name="back" size={20} tint={colors.onSurface} />
        </TouchableOpacity>
        <View style={styles.headerTitles}>
          <Text style={[styles.title, { color: colors.onSurface }]}>
            Up Next
          </Text>
          <Text style={[styles.subtitle, { color: colors.onSurfaceVariant }]}>
            {state.queueTotal > 0 ? `${state.queueTotal} tracks` : `${state.queue.length} tracks`}
          </Text>
        </View>
        {state.queueTotal > 0 && (
          <TouchableOpacity
            style={[styles.clearButton, { borderColor: colors.outline }]}
            onPress={() => Alert.alert('Clear queue?', 'Remove all tracks from the player queue?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Clear', style: 'destructive', onPress: () => onAction({ type: 'ClearQueue' }) },
            ])}
            accessibilityRole="button"
            accessibilityLabel="Clear queue"
          >
            <Text style={{ color: colors.primary, fontWeight: '600' }}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Error / Connection Notice */}
      {!!state.connectionMessage && (
        <Text style={[styles.errorNotice, { color: '#E06C62' }]}>
          {state.connectionMessage}
        </Text>
      )}

      {/* Queue Content */}
      {state.queueStatus === ContentStatus.Loading && state.queue.length === 0 ? (
        <CardSurface colors={colors}>
          <View style={styles.centerContainer}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.stateText, { color: colors.onSurfaceVariant }]}>
              Loading queue…
            </Text>
          </View>
        </CardSurface>
      ) : state.queueStatus === ContentStatus.Error && state.queue.length === 0 ? (
        <CardSurface colors={colors}>
          <Text style={[styles.stateText, { color: '#E06C62' }]}>
            Couldn't load the queue
          </Text>
        </CardSurface>
      ) : state.queue.length === 0 ? (
        <CardSurface colors={colors}>
          <Text style={[styles.stateText, { color: colors.onSurfaceVariant }]}>
            Your queue is empty
          </Text>
        </CardSurface>
      ) : (
        <CardSurface colors={colors} style={styles.queueCard}>
          {state.queue.map((track, index) => (
            <View key={track.id || index}>
              <View style={styles.row}>
                <Text
                  style={[styles.indexText, { color: colors.onSurfaceVariant }]}
                >
                  {(track.queueOffset ?? index) + 1}
                </Text>

                <Artwork
                  uri={track.artwork}
                  colors={colors}
                  size={42}
                  borderRadius={8}
                />

                <TouchableOpacity
                  style={styles.info}
                  onPress={() => onAction({ type: 'PlayQueueTrack', id: track.id })}
                  disabled={!state.supportedFeatures.includes('queue_edit')}
                  accessibilityRole="button"
                  accessibilityLabel={`Play ${track.title} from queue`}
                >
                  <Text
                    style={[styles.trackTitle, { color: colors.onSurface }]}
                    numberOfLines={1}
                  >
                    {track.title}
                  </Text>
                  <Text
                    style={[styles.trackArtist, { color: colors.onSurfaceVariant }]}
                    numberOfLines={1}
                  >
                    {track.artist || 'Unknown artist'}
                  </Text>
                </TouchableOpacity>

                {!!track.duration && (
                  <Text
                    style={[styles.duration, { color: colors.onSurfaceVariant }]}
                  >
                    {track.duration}
                  </Text>
                )}

                {state.supportedFeatures.includes('queue_edit') && (
                  <View style={styles.moveActions}>
                    <TouchableOpacity
                      onPress={() => onAction({ type: 'MoveQueueTrack', id: track.id, direction: -1 })}
                      disabled={(track.queueOffset ?? index) === 0}
                      accessibilityRole="button"
                      accessibilityLabel={`Move ${track.title} earlier`}
                    >
                      <Text style={{ color: colors.primary, fontSize: 18 }}>↑</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => onAction({ type: 'MoveQueueTrack', id: track.id, direction: 1 })}
                      disabled={(track.queueOffset ?? index) >= state.queueTotal - 1}
                      accessibilityRole="button"
                      accessibilityLabel={`Move ${track.title} later`}
                    >
                      <Text style={{ color: colors.primary, fontSize: 18 }}>↓</Text>
                    </TouchableOpacity>
                  </View>
                )}

                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={() => onAction({ type: 'RemoveQueueTrack', id: track.id })}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${track.title} from queue`}
                >
                  <Text style={[styles.removeIcon, { color: colors.onSurfaceVariant }]}>
                    ×
                  </Text>
                </TouchableOpacity>
              </View>

              {index < state.queue.length - 1 && (
                <View
                  style={[
                    styles.divider,
                    { backgroundColor: `${colors.outline}99` },
                  ]}
                />
              )}
            </View>
          ))}

          {state.queueLoadingMore && (
            <ActivityIndicator style={styles.loadMoreButton} size="small" color={colors.primary} />
          )}
        </CardSurface>
      )}
    </ScrollView>
  );
};

export const QueueScreen = React.memo(QueueScreenContent, (before, after) => {
  const a = before.state;
  const b = after.state;
  return before.colors === after.colors && before.onAction === after.onAction &&
    a.connectionMessage === b.connectionMessage && a.queue === b.queue &&
    a.queueHasMore === b.queueHasMore && a.queueLoadingMore === b.queueLoadingMore &&
    a.queueStatus === b.queueStatus && a.queueTotal === b.queueTotal &&
    a.supportedFeatures === b.supportedFeatures;
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 12,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitles: {
    flex: 1,
  },
  clearButton: {
    minHeight: 36,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  errorNotice: {
    fontSize: 13,
  },
  centerContainer: {
    paddingVertical: 20,
    alignItems: 'center',
    gap: 10,
  },
  stateText: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 14,
  },
  queueCard: {
    padding: 0,
  },
  moveActions: {
    gap: 4,
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  indexText: {
    fontSize: 12,
    width: 24,
    textAlign: 'center',
  },
  info: {
    flex: 1,
  },
  trackTitle: {
    fontSize: 14,
    fontWeight: '500',
  },
  trackArtist: {
    fontSize: 12,
    marginTop: 2,
  },
  duration: {
    fontSize: 12,
    marginRight: 4,
  },
  removeButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeIcon: {
    fontSize: 22,
    lineHeight: 24,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 46,
    marginRight: 12,
  },
  loadMoreButton: {
    borderWidth: 1,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    margin: 12,
  },
  loadMoreText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
