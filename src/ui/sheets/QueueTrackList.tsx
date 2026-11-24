import React, { memo, type Ref } from 'react';
import { StyleSheet, View } from 'react-native';
import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import { ContentStatus, type RemoteTrack } from '../../data/types';
import { useI18n } from '../../i18n';
import { AppText } from '../components/AppText';
import { Button } from '../components/Button';
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

export type QueueListItem =
  | { kind: 'loadEarlier'; id: 'queue-load-earlier' }
  | { kind: 'section'; id: string; label: string; caption?: string }
  | { kind: 'played'; id: string; track: RemoteTrack }
  | { kind: 'nowPlaying'; id: 'queue-now-playing' }
  | { kind: 'upNext'; id: string; track: RemoteTrack; upNextIndex: number }
  | { kind: 'emptyUpNext'; id: 'queue-empty-up-next' };

function keyOf(item: QueueListItem): string {
  return item.id;
}

function itemTypeOf(item: QueueListItem): string {
  return item.kind;
}

function trackSubtitle(track: RemoteTrack, t: (source: string) => string): string {
  const artist = track.artist || t('Unknown artist');
  return track.duration ? `${artist} · ${track.duration}` : artist;
}

export const PlayedQueueRow = memo(function PlayedQueueRow({
  track,
  onPlay,
}: {
  track: RemoteTrack;
  onPlay: (track: RemoteTrack) => void;
}) {
  const { t } = useI18n();
  const artworkUri = useQueueRowArtwork(track);
  return (
    <View style={styles.playedRow}>
      <TrackRow
        title={track.title || t('Unknown song')}
        subtitle={trackSubtitle(track, t)}
        artworkUri={artworkUri}
        artworkSize={QUEUE_ROW_ARTWORK}
        onPress={() => onPlay(track)}
      />
    </View>
  );
});

export function LoadEarlierQueueRow({ loading, onLoad }: { loading: boolean; onLoad: () => void }) {
  const { t } = useI18n();
  return (
    <View style={styles.loadEarlier}>
      {loading ? <Spinner /> : <Button variant="plain" label={t('Load earlier tracks')} onPress={onLoad} />}
    </View>
  );
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
  items: QueueListItem[];
  hasUpNext: boolean;
  drag: ReturnType<typeof useDragReorder>;
  cellStyle: (index: number) => ReturnType<ReturnType<typeof useDragReorder>['rowStyle']>;
  artwork: ReturnType<typeof useQueueArtworkViewability>;
  renderItem: ListRenderItem<QueueListItem>;
  header?: React.ReactElement | null;
  loadMore: () => void;
  palette: ReturnType<typeof usePalette>;
  t: ReturnType<typeof useI18n>['t'];
}

export function renderQueueEmptyState(state: QueuePlaybackState, t: ReturnType<typeof useI18n>['t']) {
  if (state.queueStatus === ContentStatus.Loading) {
    return (
      <View style={styles.message}>
        <Spinner />
        <AppText tone="inkMuted">{t('Loading queue…')}</AppText>
      </View>
    );
  }
  if (state.queueStatus === ContentStatus.Error) {
    return (
      <View style={styles.message}>
        <AppText tone="inkMuted" style={styles.centered}>
          {t('Couldn’t load the queue.')}
        </AppText>
      </View>
    );
  }
  return (
    <View style={styles.message}>
      <AppText tone="inkMuted" style={styles.centered}>
        {t('Nothing else is queued. Add songs from their menu in the Library.')}
      </AppText>
    </View>
  );
}

export function renderQueueTrackList({ state, items, hasUpNext, drag, cellStyle, artwork, renderItem, header, loadMore, palette, t }: QueueTrackListProps) {
  const { visibleArtwork, onViewableItemsChanged } = artwork;
  const footer = state.queueLoadingMore ? (
    <View style={styles.footer}>
      <Spinner />
    </View>
  ) : hasUpNext && !state.queueHasMore ? (
    <AppText variant="caption" tone="inkMuted" style={[styles.footer, styles.centered]}>
      {t('End of queue')}
    </AppText>
  ) : null;

  return (
    <VisibleQueueArtworkContext.Provider value={visibleArtwork}>
      <DragReorderCellContext.Provider value={cellStyle}>
        {/* Recycles row views; mounting fresh rows was most of the main-thread cost while flinging. */}
        <FlashList
          data={items}
          // FlashList keeps a cell's rendered row when only its index changes; rows bind drag handles
          // by index, so a reorder must re-render them or a handle drags the song that used to be there.
          extraData={items}
          getItemType={itemTypeOf}
          maintainVisibleContentPosition={NO_POSITION_KEEPING}
          CellRendererComponent={DragReorderCell}
          scrollEnabled={drag.scrollEnabled}
          keyExtractor={keyOf}
          renderItem={renderItem}
          onViewableItemsChanged={onViewableItemsChanged}
          ListHeaderComponent={header}
          ListEmptyComponent={renderQueueEmptyState(state, t)}
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
  playedRow: {
    opacity: 0.72,
  },
  loadEarlier: {
    alignItems: 'center',
    paddingVertical: Space.xs,
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
