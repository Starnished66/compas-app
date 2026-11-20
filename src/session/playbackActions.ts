import type { useSessionRating } from './useSessionRating';
import type { SessionState } from './useSessionRefs';
import { type ActionOf } from './remoteActionDispatch';
import { normalizedVolume } from './sessionPlayback';
import { CommandOutcome } from './PlaybackStatusGate';
import { toNumeric, isShuffleMode, toggleShuffleMode, toggleRepeatMode } from './playbackModes';

interface PlaybackActionsDependencies extends Pick<SessionState,
  'apiRef' | 'connectionAttemptRef' | 'featureSetRef' | 'gateRef' | 'lastNonShuffleModeRef'
  | 'latestPlayingRef' | 'pendingSeekRef' | 'pendingVolumeRef' | 'positionStoreRef' | 'setState'
  | 'stateRef'
>,
  Pick<ReturnType<typeof useSessionRating>, 'currentRatingEdit'> {
  startPollingLoop: (immediate?: boolean) => void;
}

const setPlayback = (deps: PlaybackActionsDependencies, action: ActionOf<'Play' | 'Pause' | 'SetPlaying'>) => {
  const { apiRef, gateRef, latestPlayingRef, setState, stateRef } = deps;
  const targetPlaying =
    action.type === 'Play' ? true : action.type === 'Pause' ? false : action.playing;
  if (stateRef.current.isPlaying === targetPlaying) {
    // Idempotent: already in desired state
    return;
  }
  const api = apiRef.current;
  if (!api) return;
  latestPlayingRef.current = targetPlaying;
  const token = gateRef.current.beginExplicitAction(targetPlaying);
  api.preemptArtworkRequest();
  setState((prev) => ({ ...prev, isPlaying: targetPlaying }));
  api.togglePlayback()
    .then(() => {
      gateRef.current.finishAction(token, CommandOutcome.Succeeded, Date.now());
    })
    .catch(() => {
      gateRef.current.finishAction(token, CommandOutcome.Failed, Date.now());
    });
};

const changePlaybackMode = (deps: PlaybackActionsDependencies, action: ActionOf<'ToggleShuffle' | 'CycleRepeatMode'>) => {
  const {
    apiRef, connectionAttemptRef, featureSetRef, lastNonShuffleModeRef, setState, stateRef,
  } = deps;
  const api = apiRef.current;
  if (!api) return;
  const current = stateRef.current.playbackMode;
  const supported = featureSetRef.current.has('shuffle_modes');
  if (action.type === 'ToggleShuffle' && !isShuffleMode(current)) lastNonShuffleModeRef.current = current;
  const target = action.type === 'ToggleShuffle'
    ? toggleShuffleMode(current, supported, lastNonShuffleModeRef.current)
    : toggleRepeatMode(current, supported);
  if (!isShuffleMode(target)) lastNonShuffleModeRef.current = target;
  setState((prev) => ({ ...prev, playbackMode: target }));
  const attempt = connectionAttemptRef.current;
  api.setPlayMode(toNumeric(target, supported)).catch((error) => {
    if (api === apiRef.current && attempt === connectionAttemptRef.current) setState((prev) => ({ ...prev, playbackMode: current, connectionMessage: error.message }));
  });
};

const editCurrentRating = (deps: PlaybackActionsDependencies, action: ActionOf<'SetCurrentFavorite' | 'SetCurrentRating'>) => {
  const { currentRatingEdit } = deps;
  currentRatingEdit.edit(action.type === 'SetCurrentRating' ? action.rating : action.favorite ? 5 : 0,
    action.expectedTrack, action.onSettled);
};

const handleTogglePlayback = (deps: PlaybackActionsDependencies) => {
  const { apiRef, gateRef, latestPlayingRef, setState, stateRef } = deps;
  const api = apiRef.current;
  if (!api) return;
  const nextPlaying = !stateRef.current.isPlaying;
  latestPlayingRef.current = nextPlaying;
  const token = gateRef.current.beginAction();
  api.preemptArtworkRequest();
  setState((prev) => ({ ...prev, isPlaying: nextPlaying }));
  api.togglePlayback()
    .then(() => {
      gateRef.current.finishAction(token, CommandOutcome.Succeeded, Date.now());
    })
    .catch(() => {
      gateRef.current.finishAction(token, CommandOutcome.Failed, Date.now());
    });
};

const handlePrevious = (deps: PlaybackActionsDependencies) => {
  const { apiRef, setState } = deps;
  const api = apiRef.current;
  if (!api) return;
  // Clear first so a repeated failure reads as a new message.
  setState((prev) => (prev.connectionMessage ? { ...prev, connectionMessage: null } : prev));
  api.previous().catch(() => {
    if (apiRef.current === api) setState((prev) => ({ ...prev, connectionMessage: 'Could not skip to the previous song.' }));
  });
};

const handleNext = (deps: PlaybackActionsDependencies) => {
  const { apiRef, setState } = deps;
  const api = apiRef.current;
  if (!api) return;
  // Clear first so a repeated failure reads as a new message.
  setState((prev) => (prev.connectionMessage ? { ...prev, connectionMessage: null } : prev));
  api.next().catch(() => {
    if (apiRef.current === api) setState((prev) => ({ ...prev, connectionMessage: 'Could not skip to the next song.' }));
  });
};

const handleSeekTo = (deps: PlaybackActionsDependencies, action: ActionOf<'SeekTo'>) => {
  const {
    apiRef, connectionAttemptRef, pendingSeekRef, positionStoreRef, setState, startPollingLoop,
  } = deps;
  const api = apiRef.current;
  if (!api) return;
  const targetPositionMs = Math.max(0, action.positionMs);
  const attempt = connectionAttemptRef.current;
  const pendingSeek = {
    positionMs: targetPositionMs,
    startedAtMs: Date.now(),
    commandCompletedAtMs: null as number | null,
  };
  pendingSeekRef.current = pendingSeek;
  api.preemptArtworkRequest();
  positionStoreRef.current.setPosition(targetPositionMs);
  setState((prev) => (prev.connectionMessage == null ? prev : { ...prev, connectionMessage: null }));
  api.seek(Math.round(targetPositionMs / 1000)).then(() => {
    if (attempt !== connectionAttemptRef.current || api !== apiRef.current) return;
    pendingSeek.commandCompletedAtMs = Date.now();
    startPollingLoop();
  }).catch((err: any) => {
    if (attempt !== connectionAttemptRef.current || api !== apiRef.current) return;
    if (pendingSeekRef.current === pendingSeek) pendingSeekRef.current = null;
    setState((prev) => ({ ...prev, connectionMessage: err?.message || 'Could not seek playback.' }));
    startPollingLoop();
  });
};

const handleSetVolume = (deps: PlaybackActionsDependencies, action: ActionOf<'SetVolume'>) => {
  const { apiRef, connectionAttemptRef, pendingVolumeRef, setState, startPollingLoop } = deps;
  const api = apiRef.current;
  if (!api) return;
  const volume = normalizedVolume(action.volume);
  const attempt = connectionAttemptRef.current;
  const pendingVolume = {
    volume,
    commandCompletedAtMs: null as number | null,
    expiresAtMs: Date.now() + 8000,
  };
  pendingVolumeRef.current = pendingVolume;
  api.preemptArtworkRequest();
  setState((prev) => ({ ...prev, volume, connectionMessage: null }));
  api.setVolume(Math.floor(volume * 100)).then(() => {
    if (attempt !== connectionAttemptRef.current || api !== apiRef.current) return;
    pendingVolume.commandCompletedAtMs = Date.now();
    startPollingLoop();
  }).catch((err: any) => {
    if (attempt !== connectionAttemptRef.current || api !== apiRef.current) return;
    if (pendingVolumeRef.current === pendingVolume) pendingVolumeRef.current = null;
    setState((prev) => ({ ...prev, connectionMessage: err?.message || 'Could not change volume.' }));
    startPollingLoop();
  });
};

export function createPlaybackActions(deps: PlaybackActionsDependencies) {
  const playbackActions = {
    TogglePlayback: handleTogglePlayback.bind(undefined, deps),
    Play: setPlayback.bind(undefined, deps),
    Pause: setPlayback.bind(undefined, deps),
    SetPlaying: setPlayback.bind(undefined, deps),
    Previous: handlePrevious.bind(undefined, deps),
    Next: handleNext.bind(undefined, deps),
    ToggleShuffle: changePlaybackMode.bind(undefined, deps),
    CycleRepeatMode: changePlaybackMode.bind(undefined, deps),
    SeekTo: handleSeekTo.bind(undefined, deps),
    SetVolume: handleSetVolume.bind(undefined, deps),
    SetCurrentFavorite: editCurrentRating.bind(undefined, deps),
    SetCurrentRating: editCurrentRating.bind(undefined, deps),
  };
  return { playbackActions };
}
