import { useEffect, useMemo, useRef, useState } from 'react';
import { ConnectionTransport, PlaybackMode, RemoteAction, RemoteUiState } from '../data/types';
import { PlaybackPosition } from '../session/PlaybackPositionStore';
import { formatPlaybackTime } from './playbackTime';
import { recordSkip } from './skipDirection';
import { useSnackbar } from './snackbar/useSnackbar';
import { trackKey } from './trackKey';
import { usePlaybackPositionStore } from './usePlaybackPosition';

export interface PlayerCommands {
  pendingLabel: string | null;
  skipping: boolean;
  togglePlayback(): void;
  next(): void;
  previous(): void;
  seek(positionMs: number): void;
  setVolume(volume: number): void;
  toggleShuffle(): void;
  cycleRepeat(): void;
  setFavorite(favorite: boolean): void;
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

function nextRepeatMode(mode: PlaybackMode): PlaybackMode {
  if (mode === PlaybackMode.RepeatAll) return PlaybackMode.RepeatOne;
  if (mode === PlaybackMode.RepeatOne) return PlaybackMode.Sequential;
  return PlaybackMode.RepeatAll;
}

function repeatLabel(mode: PlaybackMode): string {
  if (mode === PlaybackMode.RepeatAll) return 'Repeating the queue…';
  if (mode === PlaybackMode.RepeatOne) return 'Repeating this song…';
  return 'Repeat off…';
}

export function usePlayerCommands(state: RemoteUiState, onAction: (action: RemoteAction) => void): PlayerCommands {
  const snackbar = useSnackbar();
  const positionStore = usePlaybackPositionStore();
  const [pending, setPending] = useState<PendingCommand | null>(null);
  const counter = useRef(0);
  const latest = useRef({ state, onAction, snackbar, positionStore });
  latest.current = { state, onAction, snackbar, positionStore };
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
    const run = (action: RemoteAction, label: string, options: Omit<PendingCommand, 'id' | 'label'> = { skipping: false }) => {
      counter.current += 1;
      setPending({ id: counter.current, label, ...options });
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
      seek: (positionMs: number) => run({ type: 'SeekTo', positionMs }, `Seeking to ${formatPlaybackTime(positionMs)}…`),
      setVolume: (volume: number) =>
        run({ type: 'SetVolume', volume }, `Setting volume to ${Math.round(Math.max(0, Math.min(1, volume)) * 100)}%…`),
      toggleShuffle: () =>
        run(
          { type: 'ToggleShuffle' },
          latest.current.state.playbackMode === PlaybackMode.Shuffle ? 'Turning shuffle off…' : 'Turning shuffle on…',
        ),
      cycleRepeat: () => {
        const mode = latest.current.state.playbackMode;
        const prefix = mode === PlaybackMode.Shuffle ? 'Shuffle off · ' : '';
        run({ type: 'CycleRepeatMode' }, prefix + repeatLabel(nextRepeatMode(mode)));
      },
      setFavorite: (favorite: boolean) => {
        run({ type: 'SetCurrentFavorite', favorite }, favorite ? 'Adding to favorites…' : 'Removing from favorites…', {
          skipping: false,
          settled: (current) => current.currentFavorite === favorite,
        });
        latest.current.snackbar.show({
          text: favorite ? 'Added to favorites' : 'Removed from favorites',
          actionLabel: 'Undo',
          onAction: () => latest.current.onAction({ type: 'SetCurrentFavorite', favorite: !favorite }),
        });
      },
    };
  }, []);

  return { ...commands, pendingLabel: pending?.label ?? null, skipping: Boolean(pending?.skipping) };
}
