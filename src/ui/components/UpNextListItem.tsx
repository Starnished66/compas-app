import React, { useCallback, useRef } from 'react';
import { RemoteTrack } from '../../data/types';
import { usePalette } from '../PaletteProvider';
import { DragHandleProps } from '../useDragReorder';
import { CardSection } from './CardSection';
import { RemovableRow, RemovableRowHandle } from './RemovableRow';
import { UP_NEXT_ROW_HEIGHT, UpNextRow } from './UpNextRow';

export interface UpNextListItemProps {
  track: RemoteTrack;
  index: number;
  editing: boolean;
  current: boolean;
  playing: boolean;
  lifted: boolean;
  dragHandle?: DragHandleProps;
  onPlay: (track: RemoteTrack) => void;
  onRemove: (track: RemoteTrack) => void;
}

function UpNextListItemContent({
  track,
  index,
  editing,
  current,
  playing,
  lifted,
  dragHandle,
  onPlay,
  onRemove,
}: UpNextListItemProps) {
  const palette = usePalette();
  const removable = useRef<RemovableRowHandle>(null);
  const startRemoval = useCallback(() => removable.current?.remove(), []);

  return (
    <CardSection edge="middle">
      <RemovableRow
        ref={removable}
        rowHeight={UP_NEXT_ROW_HEIGHT}
        contentBackground={lifted ? palette.surfaceRaised : undefined}
        removeLabel={`Remove ${track.title} from queue`}
        onRemove={() => onRemove(track)}
      >
        <UpNextRow
          track={track}
          index={index}
          editing={editing}
          current={current}
          playing={playing}
          onPress={onPlay}
          onRemove={startRemoval}
          dragHandle={dragHandle}
        />
      </RemovableRow>
    </CardSection>
  );
}

export const UpNextListItem = React.memo(UpNextListItemContent);
