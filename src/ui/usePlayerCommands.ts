import { useEffect, useMemo, useRef, useState } from 'react';
import { ConnectionTransport, PlaybackMode, RatingWriteResult, RemoteAction, RemoteUiState } from '../data/types';
import { PlaybackPosition } from '../session/PlaybackPositionStore';
import { formatPlaybackTime } from './playbackTime';
import { recordSkip } from './skipDirection';
import { useOptimisticErrorSnackbar } from './sheets/useOptimisticErrorSnackbar';
import { sameSong, trackKey } from './trackKey';
import { usePlaybackPositionStore } from './usePlaybackPosition';
import { isShuffleMode, toggleRepeatMode } from '../session/playbackModes';
import { useI18n } from '../i18n';
import { dacControlsDisabled } from '../data/dacMode';
import { localizedMessage } from './localizedLabels';
import { useSnackbar } from './snackbar/useSnackbar';

export interface PlayerCommands {
  disabled: boolean;
  pendingLabel: string | null;
  skipping: boolean;
  togglePlayback(): void;
  next(): void;
  previous(): void;
  seek(positionMs: number): void;
  setVolume(volume: number): void;
  toggleShuffle(): void;
  cycleRepeat(): void;
  displayedRating: number;
  setRating(rating: number): void;
}

interface PendingCommand {
  id: number;
  label: string;
  skipping: boolean;
  settled?: (state: RemoteUiState, position: PlaybackPosition) => boolean;
}

const WIFI_FEEDBACK_MS = 800;
const BLUETOOTH_FEEDBACK_MS = 2600;
const RESTART_THRESHOLD_MS = 3000;

function repeatLabel(mode: PlaybackMode): string {
  if (mode === PlaybackMode.RepeatAll) return 'Repeating the queue…';
  if (mode === PlaybackMode.RepeatOne) return 'Repeating this song…';
  if (mode === PlaybackMode.ShuffleRepeat) return 'Repeating the queue…';
  return 'Repeat off…';
}

function displayedRating(state: RemoteUiState): number {
  const edit = state.pendingCurrentRating;
  return edit && sameSong(edit.track, state.currentTrack) ? edit.rating : state.currentRating;
}

export function usePlayerCommands(state: RemoteUiState, onAction: (action: RemoteAction) => void): PlayerCommands {
  const { t } = useI18n();
  const positionStore = usePlaybackPositionStore();
  const snackbar = useSnackbar();
  const watchResult = useOptimisticErrorSnackbar(state.connectionMessage);
  const [pending, setPending] = useState<PendingCommand | null>(null);
  const counter = useRef(0);
  const latest = useRef({ state, onAction, watchResult, positionStore, t, snackbar });
  latest.current = { state, onAction, watchResult, positionStore, t, snackbar };
  const feedbackMs = state.connectionTransport === ConnectionTransport.Bluetooth ? BLUETOOTH_FEEDBACK_MS : WIFI_FEEDBACK_MS;
  useEffect(() => {
    const settled = pending?.settled;
    if (!settled) return;
    const settle = () => {
      if (settled(state, positionStore.getSnapshot())) {
        setPending((current) => (current?.id === pending.id ? null : current));
      }
    };
    settle();
    return positionStore.subscribe(settle);
  }, [pending, state, positionStore]);

  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setPending((current) => (current?.id === pending.id ? null : current)), feedbackMs);
    return () => clearTimeout(timer);
  }, [feedbackMs, pending]);

  const commands = useMemo(() => {
    const begin = (label: string, options: Omit<PendingCommand, 'id' | 'label'>) => {
      setPending({ id: ++counter.current, label: latest.current.t(label), ...options });
    };

    const run = (action: RemoteAction, label: string, options: Omit<PendingCommand, 'id' | 'label'> = { skipping: false }) => {
      if (dacControlsDisabled(latest.current.state.dacMode)) return;
      begin(label, options);
      latest.current.watchResult();
      latest.current.onAction(action);
    };

    const skip = (direction: -1 | 1) => {
      const before = latest.current.state;
      const fromKey = trackKey(before.currentTrack);
      const restarting = direction < 0 && latest.current.positionStore.getSnapshot().positionMs > RESTART_THRESHOLD_MS;
      if (!restarting) recordSkip(direction, fromKey);
      const label = direction > 0 ? 'Skipping…' : restarting ? 'Restarting…' : 'Going back…';
      run(direction > 0 ? { type: 'Next' } : { type: 'Previous' }, label, {
        skipping: true,
        settled: restarting
          ? (current, position) => position.positionMs < RESTART_THRESHOLD_MS || trackKey(current.currentTrack) !== fromKey
          : (current) => trackKey(current.currentTrack) !== fromKey,
      });
    };

    return {
      togglePlayback: () =>
        run({ type: 'TogglePlayback' }, latest.current.state.isPlaying ? 'Pausing…' : 'Starting playback…'),
      next: () => skip(1),
      previous: () => skip(-1),
      seek: (positionMs: number) =>
        run({ type: 'SeekTo', positionMs }, latest.current.t('Seeking to {time}…', { time: formatPlaybackTime(positionMs) })),
      setVolume: (volume: number) =>
        run({ type: 'SetVolume', volume }, latest.current.t('Setting volume to {percent}%…', { percent: Math.round(Math.max(0, Math.min(1, volume)) * 100) })),
      toggleShuffle: () =>
        run(
          { type: 'ToggleShuffle' },
          isShuffleMode(latest.current.state.playbackMode) ? 'Turning shuffle off…' : 'Turning shuffle on…',
        ),
      cycleRepeat: () => {
        const mode = latest.current.state.playbackMode;
        const supportsShuffleModes = latest.current.state.supportedFeatures.includes('shuffle_modes');
        const target = toggleRepeatMode(mode, supportsShuffleModes);
        const label = latest.current.t(repeatLabel(target));
        run({ type: 'CycleRepeatMode' }, isShuffleMode(mode) && !supportsShuffleModes ? `${latest.current.t('Shuffle off')} · ${label}` : label);
      },
      setRating: (rating: number) => {
        const { state: before, t: translate, onAction: dispatch, snackbar: feedback } = latest.current;
        if (dacControlsDisabled(before.dacMode)) return;
        const expectedTrack = before.currentTrack;
        if (!expectedTrack) return;
        const stars = before.supportedFeatures.includes('ratings_edit');
        begin(stars ? 'Saving rating…' : rating ? 'Adding to favorites…' : 'Removing from favorites…', {
          skipping: false, settled: (current) =>
            !sameSong(current.pendingCurrentRating?.track, expectedTrack) || !sameSong(current.currentTrack, expectedTrack),
        });
        const previous = displayedRating(before);
        const undo: RemoteAction = stars ? { type: 'SetCurrentRating', rating: previous }
          : { type: 'SetCurrentFavorite', favorite: rating === 0 };
        const onSettled = (result: RatingWriteResult) => feedback.show('error' in result
          ? { text: localizedMessage(result.error, translate) }
          : {
              text: translate(stars ? (result.rating ? 'Rating saved' : 'Rating cleared')
                : (result.rating ? 'Added to favorites' : 'Removed from favorites')),
              actionLabel: translate('Undo'),
              onAction: () => latest.current.onAction(undo),
            });
        dispatch(stars ? { type: 'SetCurrentRating', rating, expectedTrack, onSettled }
          : { type: 'SetCurrentFavorite', favorite: rating > 0, expectedTrack, onSettled });
      },
    };
  }, []);

  return {
    ...commands,
    displayedRating: displayedRating(state),
    disabled: dacControlsDisabled(state.dacMode),
    pendingLabel: pending?.label ?? null,
    skipping: Boolean(pending?.skipping),
  };
}
