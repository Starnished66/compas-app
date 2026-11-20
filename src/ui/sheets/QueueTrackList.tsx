import React, { memo, type Ref } from 'react';
import { StyleSheet, View } from 'react-native';
import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import { ContentStatus, type RemoteTrack } from '../../data/types';
import { useI18n } from '../../i18n';
import { AppText } from '../components/AppText';
import { DragHandle } from '../components/DragHandle';
import { DragReorderCell } from '../components/DragReorderCell';
import { DragReorderCellContext } from '../components/dragReorderCellContext';
import { Icon } from '../components/Icon';
import { RemovableRow, type RemovableRowHandle } from '../components/RemovableRow';
import { Spinner } from '../components/Spinner';
import { TrackRow } from '../components/TrackRow';
import { usePalette } from '../PaletteProvider';
import { Space } from '../tokens';
import type { DragHandleProps, useDragReorder } from '../useDragReorder';
import { VisibleQueueArtworkContext, useQueueRowArtwork, type useQueueArtworkViewability } from '../useQueueArtworkViewability';
import type { QueuePlaybackState } from './QueueSheet';

const QUEUE_ROW_ARTWORK = 40;
const END_REACHED_THRESHOLD = 0.5;
export const QUEUE_ROW_HEIGHT = 56;
const NO_POSITION_KEEPING = { disabled: true };

function keyOf(track: RemoteTrack): string {
  return track.id;
}

function trackSubtitle(track: RemoteTrack, t: (source: string) => string): string {
  const artist = track.artist || t('Unknown artist');
  return track.duration ? `${artist} · ${track.duration}` : artist;
}

interface QueueRowProps {
  track: RemoteTrack;
  selecting: boolean;
  selected: boolean;
  lifted: boolean;
  removable: boolean;
  dragHandle?: DragHandleProps;
  rowRef?: Ref<RemovableRowHandle>;
  onPlay: (track: RemoteTrack) => void;
  onToggleSelected: (track: RemoteTrack) => void;
  onBeginSelecting: (track: RemoteTrack) => void;
  onRemove: (track: RemoteTrack) => void;
}

// Memoized so selection, drag and page loads re-render only the rows whose own props changed.
export const QueueRow = memo(function QueueRow({
  track,
  selecting,
  selected,
  lifted,
  removable,
  dragHandle,
  rowRef,
  onPlay,
  onToggleSelected,
  onBeginSelecting,
  onRemove,
}: QueueRowProps) {
  const { t } = useI18n();
  const palette = usePalette();
  const title = track.title || t('Unknown song');
  const subtitle = trackSubtitle(track, t);
  const artworkUri = useQueueRowArtwork(track);
  if (selecting) {
    return (
      <TrackRow
        title={title}
        subtitle={subtitle}
        artworkUri={artworkUri}
        artworkSize={QUEUE_ROW_ARTWORK}
        selected={selected}
        onPress={() => onToggleSelected(track)}
        onLongPress={() => onToggleSelected(track)}
        accessory={<Icon name={selected ? 'check' : 'selectionCircle'} color={selected ? palette.accent : palette.inkMuted} />}
      />
    );
  }
  return renderEditableRow({ track, lifted, removable, dragHandle, rowRef, onPlay, onBeginSelecting, onRemove },
    { title, subtitle, artworkUri, t, palette });
});

function renderEditableRow(
  { track, lifted, removable, dragHandle, rowRef, onPlay, onBeginSelecting, onRemove }:
    Omit<QueueRowProps, 'selecting' | 'selected' | 'onToggleSelected'>,
  { title, subtitle, artworkUri, t, palette }: {
    title: string;
    subtitle: string;
    artworkUri: ReturnType<typeof useQueueRowArtwork>;
    t: ReturnType<typeof useI18n>['t'];
    palette: ReturnType<typeof usePalette>;
  },
) {
  const play = () => onPlay(track);
  return (
    <RemovableRow
      ref={rowRef}
      rowHeight={QUEUE_ROW_HEIGHT}
      swipeToRemove={removable}
      accessibilityLabel={`${track.title}, ${subtitle}`}
      removeLabel={t('Remove')}
      onRemove={() => onRemove(track)}
      onTap={play}
      contentBackground={lifted ? palette.surfaceRaised : undefined}
    >
      <TrackRow
        title={title}
        subtitle={subtitle}
        artworkUri={artworkUri}
        artworkSize={QUEUE_ROW_ARTWORK}
        onPress={play}
        onLongPress={() => onBeginSelecting(track)}
        accessory={dragHandle ? <DragHandle handle={dragHandle} /> : undefined}
      />
    </RemovableRow>
  );
}

interface QueueTrackListProps {
  state: QueuePlaybackState;
  rows: RemoteTrack[];
  drag: ReturnType<typeof useDragReorder>;
  artwork: ReturnType<typeof useQueueArtworkViewability>;
  renderTrack: ListRenderItem<RemoteTrack>;
  loadMore: () => void;
  palette: ReturnType<typeof usePalette>;
  t: ReturnType<typeof useI18n>['t'];
}

export function renderQueueTrackList({ state, rows, drag, artwork, renderTrack, loadMore, palette, t }: QueueTrackListProps) {
  const { visibleArtwork, onViewableItemsChanged } = artwork;
  const hasRows = rows.length > 0;
  const emptyState =
    state.queueStatus === ContentStatus.Loading ? (
      <View style={styles.message}>
        <Spinner />
        <AppText tone="inkMuted">{t('Loading queue…')}</AppText>
      </View>
    ) : state.queueStatus === ContentStatus.Error ? (
      <View style={styles.message}>
        <AppText tone="inkMuted" style={styles.centered}>
          {t('Couldn’t load the queue.')}
        </AppText>
      </View>
    ) : (
      <View style={styles.message}>
        <AppText tone="inkMuted" style={styles.centered}>
          {t('Nothing else is queued. Add songs from their menu in the Library.')}
        </AppText>
      </View>
    );

  const footer = state.queueLoadingMore ? (
    <View style={styles.footer}>
      <Spinner />
    </View>
  ) : hasRows && !state.queueHasMore ? (
    <AppText variant="caption" tone="inkMuted" style={[styles.footer, styles.centered]}>
      {t('End of queue')}
    </AppText>
  ) : null;

  return (
    <VisibleQueueArtworkContext.Provider value={visibleArtwork}>
      <DragReorderCellContext.Provider value={drag.rowStyle}>
        {/* Recycles row views; mounting fresh rows was most of the main-thread cost while flinging. */}
        <FlashList
          data={rows}
          // FlashList keeps a cell's rendered row when only its index changes; rows bind drag handles
          // by index, so a reorder must re-render them or a handle drags the song that used to be there.
          extraData={rows}
          maintainVisibleContentPosition={NO_POSITION_KEEPING}
          CellRendererComponent={DragReorderCell}
          scrollEnabled={drag.scrollEnabled}
          keyExtractor={keyOf}
          renderItem={renderTrack}
          onViewableItemsChanged={onViewableItemsChanged}
          ListEmptyComponent={emptyState}
          ListFooterComponent={footer}
          onEndReached={loadMore}
          onEndReachedThreshold={END_REACHED_THRESHOLD}
          showsVerticalScrollIndicator={false}
          style={StyleSheet.flatten([styles.list, { backgroundColor: palette.surface }])}
        />
      </DragReorderCellContext.Provider>
    </VisibleQueueArtworkContext.Provider>
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  message: {
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.xl + Space.sm,
    paddingHorizontal: Space.xl,
  },
  centered: {
    textAlign: 'center',
  },
  footer: {
    padding: Space.lg,
    alignItems: 'center',
  },
});
