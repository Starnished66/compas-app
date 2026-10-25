import { useEffect, useMemo, useRef, useState } from 'react';
import { ConnectionTransport, PlaybackMode, RemoteAction, RemoteUiState } from '../data/types';
import { PlaybackPosition } from '../session/PlaybackPositionStore';
import { formatPlaybackTime } from './playbackTime';
import { recordSkip } from './skipDirection';
import { useOptimisticErrorSnackbar } from './sheets/useOptimisticErrorSnackbar';
import { trackKey } from './trackKey';
import { usePlaybackPositionStore } from './usePlaybackPosition';
import { isShuffleMode, toggleRepeatMode } from '../session/playbackModes';
import { useI18n } from '../i18n';

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

function repeatLabel(mode: PlaybackMode): string {
  if (mode === PlaybackMode.RepeatAll) return 'Repeating the queue…';
  if (mode === PlaybackMode.RepeatOne) return 'Repeating this song…';
  if (mode === PlaybackMode.ShuffleRepeat) return 'Repeating the queue…';
  return 'Repeat off…';
}

export function usePlayerCommands(state: RemoteUiState, onAction: (action: RemoteAction) => void): PlayerCommands {
  const { t } = useI18n();
  const positionStore = usePlaybackPositionStore();
  // Commands are fire-and-forget in the session; a failure lands in connectionMessage, which the
  // session snackbars skip whenever a screen shows it inline (hidden under Now Playing), so the
  // control that sent the command reports it here.
  const watchResult = useOptimisticErrorSnackbar(state.connectionMessage, state.currentFavorite);
  const [pending, setPending] = useState<PendingCommand | null>(null);
  const counter = useRef(0);
  const latest = useRef({ state, onAction, watchResult, positionStore, t });
  latest.current = { state, onAction, watchResult, positionStore, t };
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
      setPending({ id: counter.current, label: latest.current.t(label), ...options });
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
      setFavorite: (favorite: boolean) => {
        run({ type: 'SetCurrentFavorite', favorite }, favorite ? 'Adding to favorites…' : 'Removing from favorites…', {
          skipping: false,
          settled: (current) => current.currentFavorite === favorite,
        });
        // Announced once the player reports the new favorite state, never ahead of a failure.
        latest.current.watchResult({
          message: {
            text: favorite ? latest.current.t('Added to favorites') : latest.current.t('Removed from favorites'),
            actionLabel: latest.current.t('Undo'),
            onAction: () => latest.current.onAction({ type: 'SetCurrentFavorite', favorite: !favorite }),
          },
          confirmed: (current) => current === favorite,
        });
      },
    };
  }, []);

  return { ...commands, pendingLabel: pending?.label ?? null, skipping: Boolean(pending?.skipping) };
}
