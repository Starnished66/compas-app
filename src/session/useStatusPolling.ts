import type { useSessionRating } from './useSessionRating';
import type { useQueuePages } from './useQueuePages';
import type { GateSnapshot } from './PlaybackStatusGate';
import type { SessionState } from './useSessionRefs';
import { normalizedVolume, trackFromStatus } from './sessionPlayback';
import { useRef } from 'react';
import { ConnectionStatus, ConnectionTransport, PlaybackStatus } from '../data/types';
import { RemoteApi } from '../data/RemoteApi';
import { useLazyRef } from './useLazyRef';
import { StatusPollLoop } from './StatusPollLoop';
import { collectionJobSettled } from './collectionJobState';
import { fromNumeric } from './playbackModes';
import { PassiveWifiProbe } from './wifiUpgradeIdentity';
import { ratingFromStatus } from './trackRating';
import { withPolledPlayback } from './polledPlayback';
import { BluetoothRequestPolicy } from './BluetoothRequestPolicy';
import { stopPlaybackService } from '../../modules/compas-media-session/src/index';
import type { NowPlayingArtwork } from './NowPlayingArtwork';

const MEDIA_ACTION_RECONCILE_DELAY_MS = 1200;
// In the background the poll only keeps the notification current.
const BACKGROUND_STATUS_POLL_MS = 5000;

type PollingSessionState = Pick<SessionState,
  'apiRef' | 'appForegroundRef' | 'autoReconnectEnabledRef' | 'bluetoothAudioOutputRef'
  | 'bulkSelectionsRef' | 'collectionPendingRef' | 'connectedPlayerKeyRef' | 'connectionAttemptRef'
  | 'currentTrackRef' | 'deferredBluetoothArtworkEntryIdsRef' | 'featureSetRef' | 'gateRef'
  | 'lastBluetoothArtworkAtRef' | 'lastQueueRefreshAtRef' | 'pendingSeekRef' | 'pendingVolumeRef'
  | 'pinStoreRef' | 'positionStoreRef' | 'setState' | 'sortingRefreshAtRef' | 'sortingWriteRef'
  | 'stateRef'
>;

interface StatusPollingDependencies extends Pick<ReturnType<typeof useQueuePages>, 'refreshQueue' | 'refreshQueueIfChanged'>,
  Pick<ReturnType<typeof useSessionRating>, 'currentRatingEdit'> {
  shared: PollingSessionState;
  loadLibraryArtwork: (id: string) => Promise<void>;
  nowPlayingArtwork: NowPlayingArtwork;
  pauseForBluetoothPairing: (err: any) => boolean;
  refreshLibrarySorting: (api: RemoteApi) => Promise<void>;
  runPinCooldown: (seconds: number, pinInput?: string) => void;
  scheduleAutoReconnect: (initialDelayMs?: number) => void;
  stopSearchReads: (keepVerified?: boolean) => void;
  tryUpgradeToWifi: (currentApi: RemoteApi, candidateAddress?: string | undefined, explicit?: boolean, isStillRequested?: () => boolean, expectedPublicLibraryId?: string | undefined) => Promise<boolean>;
  wifiUpgradeBlocked: () => boolean | { id: number; api: RemoteApi; attempt: number; startedAt: number; };
  wifiUpgradeScanCleanupRef: React.RefObject<(() => void) | null>;
}

interface PollingCommandsContext extends StatusPollingDependencies {
  statusPollLoopRef: React.RefObject<StatusPollLoop>;
  reconcileOnceRef: React.RefObject<boolean>;
  reconcileTimerRef: React.RefObject<ReturnType<typeof setTimeout> | null>;
  passiveWifiProbeRef: React.RefObject<PassiveWifiProbe>;
}

// Background Bluetooth audio suspends polling; a lock-screen action gets one status read
// shortly after, so the notification shows the new track and play/pause follows the player.
const reconcileAfterMediaAction = (deps: PollingCommandsContext) => {
  const {
    shared: { apiRef, appForegroundRef, bluetoothAudioOutputRef, stateRef },
    reconcileOnceRef, reconcileTimerRef,
  } = deps;
  if (!BluetoothRequestPolicy.allowsActionReconciliation(
    stateRef.current.connectionTransport,
    appForegroundRef.current,
    bluetoothAudioOutputRef.current
  )) return;
  if (reconcileTimerRef.current) clearTimeout(reconcileTimerRef.current);
  reconcileTimerRef.current = setTimeout(() => {
    reconcileTimerRef.current = null;
    if (!apiRef.current) return;
    reconcileOnceRef.current = true;
    startPollingLoop(deps);
  }, MEDIA_ACTION_RECONCILE_DELAY_MS);
};

const stopPolling = (deps: PollingCommandsContext) => {
  const { reconcileOnceRef, reconcileTimerRef, statusPollLoopRef } = deps;
  statusPollLoopRef.current.stop();
  clearTimeout(reconcileTimerRef.current ?? undefined);
  reconcileTimerRef.current = null;
  reconcileOnceRef.current = false;
};

const settleStatusJobs = (deps: PollingCommandsContext, api: RemoteApi, status: PlaybackStatus, ownsSession: () => boolean) => {
  const {
    shared: { collectionPendingRef, connectionAttemptRef, featureSetRef, setState, sortingRefreshAtRef, sortingWriteRef },
    refreshLibrarySorting, refreshQueue,
  } = deps;
  const collection = collectionPendingRef.current;
  if (collection && collection.api === api && collection.attempt === connectionAttemptRef.current && collectionJobSettled(collection.id, collection.startedAt, status.collectionJob, Date.now())) {
    collectionPendingRef.current = null;
    setState((prev) => ({ ...prev, collectionBusy: false,
      connectionMessage: status.collectionJob?.id === collection.id && status.collectionJob.state === 'error' ? status.collectionJob.error || 'Could not play collection' : Date.now() - collection.startedAt > 120000 ? 'The player has not confirmed collection playback.' : prev.connectionMessage }));
    refreshQueue(api, ownsSession).catch(() => {});
  }
  if (featureSetRef.current.has('library_sorting') && !sortingWriteRef.current && Date.now() - sortingRefreshAtRef.current > 10000) {
    sortingRefreshAtRef.current = Date.now();
    void refreshLibrarySorting(api);
  }
};

const publishTrack = (deps: PollingCommandsContext, status: PlaybackStatus, transport: ConnectionTransport, playbackActive: boolean, now: number, commandGeneration: number) => {
  const {
    shared: { appForegroundRef, currentTrackRef, gateRef, lastBluetoothArtworkAtRef }, nowPlayingArtwork,
  } = deps;
  const trackChanged =
    status.title !== currentTrackRef.current?.title ||
    status.artist !== currentTrackRef.current?.artist ||
    status.album !== currentTrackRef.current?.album;

  const bluetoothPriority = BluetoothRequestPolicy.requiresBluetoothAudioPriority(
    transport,
    status.bluetoothAudioOutput
  );
  const artworkDue = !bluetoothPriority || now - lastBluetoothArtworkAtRef.current >=
    BluetoothRequestPolicy.artworkMinIntervalMs(transport, status.bluetoothAudioOutput);
  const artworkRequest = {
    allowed: BluetoothRequestPolicy.allowsArtworkRequest(transport, playbackActive, status.bluetoothAudioOutput) &&
      (!bluetoothPriority || (appForegroundRef.current && gateRef.current.confirmedPaused)) &&
      artworkDue,
    commandGeneration,
  };
  const artworkUri = status.title ? nowPlayingArtwork.sync(status, artworkRequest) ?? undefined : undefined;

  const hasTrackMetadata = !!(status.title || status.artist || status.album);
  const nextTrack = trackFromStatus(status, (status.durationSeconds || 0) * 1000, { artwork: artworkUri }) ??
    (!hasTrackMetadata && (status.playing || status.paused) ? currentTrackRef.current : null);

  const previousTrack = currentTrackRef.current;
  const currentTrack = nextTrack && previousTrack &&
    nextTrack.id === previousTrack.id &&
    nextTrack.title === previousTrack.title &&
    nextTrack.artist === previousTrack.artist &&
    nextTrack.album === previousTrack.album &&
    nextTrack.duration === previousTrack.duration &&
    nextTrack.artwork === previousTrack.artwork &&
    nextTrack.codec === previousTrack.codec &&
    nextTrack.sourceBitDepth === previousTrack.sourceBitDepth &&
    nextTrack.sourceSampleRateHz === previousTrack.sourceSampleRateHz
    ? previousTrack : nextTrack;

  currentTrackRef.current = currentTrack;
  return { currentTrack, trackChanged };
};

const reconcilePosition = (deps: PollingCommandsContext, status: PlaybackStatus, playbackActive: boolean, now: number, requestStartedAtMs: number) => {
  const { pendingSeekRef } = deps.shared;
  const serverPositionMs = (status.positionSeconds || 0) * 1000;
  let displayedPositionMs = serverPositionMs;
  const pendingSeek = pendingSeekRef.current;
  if (pendingSeek) {
    const elapsedMs = Math.max(0, now - pendingSeek.startedAtMs);
    const optimisticPositionMs = pendingSeek.positionMs + (playbackActive ? elapsedMs : 0);
    const seekConfirmedByPoll = pendingSeek.commandCompletedAtMs != null &&
      requestStartedAtMs >= pendingSeek.commandCompletedAtMs &&
      Math.abs(serverPositionMs - optimisticPositionMs) <= 2500;
    const seekExpired = pendingSeek.commandCompletedAtMs != null &&
      now - pendingSeek.commandCompletedAtMs > 8000;
    if (seekConfirmedByPoll || seekExpired) {
      pendingSeekRef.current = null;
    } else {
      displayedPositionMs = optimisticPositionMs;
    }
  }
  return displayedPositionMs;
};

const reconcileVolume = (deps: PollingCommandsContext, status: PlaybackStatus, now: number, requestStartedAtMs: number) => {
  const { pendingVolumeRef } = deps.shared;
  let displayedVolume = normalizedVolume(status.volume);
  const pendingVolume = pendingVolumeRef.current;
  if (pendingVolume) {
    const volumeConfirmedByPoll = pendingVolume.commandCompletedAtMs != null &&
      requestStartedAtMs >= pendingVolume.commandCompletedAtMs &&
      Math.abs(displayedVolume - pendingVolume.volume) <= 0.02;
    if (volumeConfirmedByPoll || now > pendingVolume.expiresAtMs) {
      pendingVolumeRef.current = null;
    } else {
      displayedVolume = pendingVolume.volume;
    }
  }
  return displayedVolume;
};

const publishPlayerDetails = (deps: PollingCommandsContext, status: PlaybackStatus) => {
  const { featureSetRef, setState } = deps.shared;
  setState((prev) => prev.dacMode === (status.dacMode ?? 'none')
    ? prev : { ...prev, dacMode: status.dacMode ?? 'none' });
  setState((prev) => {
    const playerAccentColor = featureSetRef.current.has('player_accent') ? status.accentColor ?? null : null;
    const deviceModel = featureSetRef.current.has('device_info') ? status.deviceModel ?? null : null;
    const playerVersion = featureSetRef.current.has('device_info') ? status.playerVersion ?? null : null;
    if (prev.playerAccentColor === playerAccentColor && prev.deviceModel === deviceModel && prev.playerVersion === playerVersion) return prev;
    return { ...prev, playerAccentColor, deviceModel, playerVersion };
  });
  setState((prev) => {
    const settingsRevision = featureSetRef.current.has('settings_v1') ? status.settingsRevision ?? null : null;
    const settingsEpoch = featureSetRef.current.has('settings_v1') ? status.settingsEpoch ?? null : null;
    if (prev.settingsRevision === settingsRevision && prev.settingsEpoch === settingsEpoch) return prev;
    return { ...prev, settingsRevision, settingsEpoch };
  });
};

const schedulePollFollowups = (deps: PollingCommandsContext, api: RemoteApi, status: PlaybackStatus, transport: ConnectionTransport, now: number, trackChanged: boolean, confirmed: boolean, playbackActive: boolean, ownsSession: () => boolean) => {
  const {
    shared: { appForegroundRef, deferredBluetoothArtworkEntryIdsRef, lastQueueRefreshAtRef, stateRef },
    loadLibraryArtwork, refreshQueueIfChanged,
  } = deps;
  const foreground = appForegroundRef.current;
  const nextInterval = Math.max(
    BluetoothRequestPolicy.statusPollInterval(transport, 1500, status.bluetoothAudioOutput),
    foreground ? 0 : BACKGROUND_STATUS_POLL_MS
  );
  const queueInterval = foreground ? BluetoothRequestPolicy.queuePollInterval(
    transport,
    stateRef.current.screen,
    5000,
    status.bluetoothAudioOutput
  ) : null;
  if (queueInterval != null && now - lastQueueRefreshAtRef.current >= queueInterval) {
    lastQueueRefreshAtRef.current = now;
    refreshQueueIfChanged(api, ownsSession).catch(() => {});
  }
  if (trackChanged && transport === ConnectionTransport.Bluetooth && !queueInterval) {
    refreshQueueIfChanged(api, ownsSession).catch(() => {});
    lastQueueRefreshAtRef.current = now;
  }
  const bluetoothArtCanResume = BluetoothRequestPolicy.allowsArtworkRequest(
    transport,
    playbackActive,
    status.bluetoothAudioOutput
  ) && (!BluetoothRequestPolicy.requiresBluetoothAudioPriority(transport, status.bluetoothAudioOutput) ||
    (confirmed && !playbackActive && appForegroundRef.current));
  if (bluetoothArtCanResume && deferredBluetoothArtworkEntryIdsRef.current.length > 0) {
    const entryId = deferredBluetoothArtworkEntryIdsRef.current.shift();
    if (entryId) setTimeout(() => {
      if (ownsSession()) void loadLibraryArtwork(entryId);
    }, 0);
  }
  return nextInterval;
};

const applyStatusResponse = (
  deps: PollingCommandsContext,
  api: RemoteApi, status: PlaybackStatus, transport: ConnectionTransport, ownsSession: () => boolean,
  snap: GateSnapshot, requestStartedAtMs: number, commandGeneration: number,
) => {
  const { bluetoothAudioOutputRef, featureSetRef, gateRef, positionStoreRef, setState, stateRef } = deps.shared;
  settleStatusJobs(deps, api, status, ownsSession);
  const now = Date.now();
  bluetoothAudioOutputRef.current = status.bluetoothAudioOutput ?? null;

  const playbackActive = status.playing && !status.paused;
  const confirmed = gateRef.current.confirmStatus(snap, playbackActive, now);
  const effectivePlaying = confirmed ? playbackActive : stateRef.current.isPlaying;

  const { currentTrack, trackChanged } = publishTrack(deps, status, transport, playbackActive, now, commandGeneration);
  const mode =
    fromNumeric(status.playMode, featureSetRef.current.has('shuffle_modes'));

  const displayedPositionMs = reconcilePosition(deps, status, playbackActive, now, requestStartedAtMs);
  const displayedVolume = reconcileVolume(deps, status, now, requestStartedAtMs);
  positionStoreRef.current.set(displayedPositionMs, (status.durationSeconds || 0) * 1000);
  setState((prev) => withPolledPlayback(prev, {
    isPlaying: effectivePlaying,
    volume: displayedVolume,
    currentTrack,
    playbackMode: mode,
    currentRating: ratingFromStatus(status, featureSetRef.current.has('ratings_edit')),
  }));
  publishPlayerDetails(deps, status);
  return schedulePollFollowups(deps, api, status, transport, now, trackChanged, confirmed, playbackActive, ownsSession);
};

const invalidateLostSession = (deps: PollingCommandsContext) => {
  const {
    shared: { apiRef, bluetoothAudioOutputRef, bulkSelectionsRef, connectedPlayerKeyRef, setState },
    currentRatingEdit, nowPlayingArtwork, stopSearchReads,
  } = deps;
  const playerKey = connectedPlayerKeyRef.current;
  nowPlayingArtwork.invalidatePending();
  stopSearchReads(false);
  currentRatingEdit.cancel();
  setState((prev) => prev.pendingCurrentRating ? { ...prev, pendingCurrentRating: undefined } : prev);
  apiRef.current = null;
  bulkSelectionsRef.current.clear();
  connectedPlayerKeyRef.current = null;
  bluetoothAudioOutputRef.current = null;
  return playerKey;
};

const showRejectedPin = (deps: PollingCommandsContext) => {
  const { positionStoreRef, setState } = deps.shared;
  stopPlaybackService().catch(() => {});
  positionStoreRef.current.reset();
  setState((prev) => ({
    ...prev,
    connectionStatus: ConnectionStatus.Error,
    connectionMessage: 'Remote Control requires the PIN configured on the player.',
    pinDialogVisible: true,
    pinInput: '',
    pinError: 'The saved PIN was rejected. Enter the current PIN.',
    currentTrack: null,
    isPlaying: false,
  }));
};

const recoverFromStatusLoss = (deps: PollingCommandsContext, err: any, transport: ConnectionTransport) => {
  const { shared: { autoReconnectEnabledRef, setState }, pauseForBluetoothPairing, scheduleAutoReconnect } = deps;
  // Unexpected connection loss during poll
  if (transport === ConnectionTransport.Bluetooth && pauseForBluetoothPairing(err)) return;
  if (autoReconnectEnabledRef.current) {
    setState((prev) => ({
      ...prev,
      connectionStatus: ConnectionStatus.Connecting,
      connectionMessage: 'Reconnecting to player…',
    }));
    scheduleAutoReconnect(2000);
  } else {
    setState((prev) => ({
      ...prev,
      connectionStatus: ConnectionStatus.Error,
      connectionMessage: err?.message || 'Connection to Compás player was lost.',
    }));
  }
};

const poll = async (deps: PollingCommandsContext, ownsLoop: () => boolean): Promise<number | undefined> => {
  const {
    shared: { apiRef, appForegroundRef, bluetoothAudioOutputRef, connectionAttemptRef, featureSetRef, gateRef, pinStoreRef, stateRef },
    passiveWifiProbeRef, reconcileOnceRef, runPinCooldown, tryUpgradeToWifi, wifiUpgradeBlocked, wifiUpgradeScanCleanupRef,
  } = deps;
  const api = apiRef.current;
  if (!api || stateRef.current.connectionStatus !== ConnectionStatus.Connected) return;

  const attempt = connectionAttemptRef.current;
  const ownsSession = () => ownsLoop() && attempt === connectionAttemptRef.current && apiRef.current === api;
  const transport = stateRef.current.connectionTransport;
  const reconcile = reconcileOnceRef.current;
  reconcileOnceRef.current = false;
  const allowsPassive = BluetoothRequestPolicy.allowsPassiveRequests(
    transport,
    appForegroundRef.current,
    bluetoothAudioOutputRef.current
  );
  if (!reconcile && !allowsPassive) return 1000;

  try {
    if (allowsPassive && transport === ConnectionTransport.Bluetooth && featureSetRef.current.has(RemoteApi.CATALOG_SYNC_FEATURE) &&
        !wifiUpgradeScanCleanupRef.current && !wifiUpgradeBlocked()) {
      passiveWifiProbeRef.current.request(api, () => tryUpgradeToWifi(api));
    }
    const snap = gateRef.current.snapshot();
    const requestStartedAtMs = Date.now();
    const commandGeneration = api.commandGeneration;
    const status = await api.status();
    if (!ownsSession()) return;
    return applyStatusResponse(deps, api, status, transport, ownsSession, snap, requestStartedAtMs, commandGeneration);
  } catch (err: any) {
    if (!ownsSession()) return;
    const playerKey = invalidateLostSession(deps);
    if (err?.statusCode === 429 && err?.pinRateLimited) {
      runPinCooldown(
        Math.max(1, Math.min(3600, Number(err.retryAfterSeconds) || 60)),
        stateRef.current.pinInput
      );
      return;
    }
    if (err?.statusCode === 401 && err?.pinRequired) {
      if (playerKey) {
        await pinStoreRef.current.remove(playerKey);
        if (!ownsLoop() || attempt !== connectionAttemptRef.current) return;
      }
      showRejectedPin(deps);
      return;
    }
    recoverFromStatusLoss(deps, err, transport);
  }
};

const startPollingLoop = (deps: PollingCommandsContext, immediate = false) => {
  const { statusPollLoopRef } = deps;
  statusPollLoopRef.current.request(poll.bind(undefined, deps), immediate ? 0 : 300);
};

export function useStatusPolling(deps: StatusPollingDependencies) {
  const statusPollLoopRef = useLazyRef(() => new StatusPollLoop());
  const reconcileOnceRef = useRef(false);
  const reconcileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const passiveWifiProbeRef = useLazyRef(() => new PassiveWifiProbe());
  const context = { ...deps, statusPollLoopRef, reconcileOnceRef, reconcileTimerRef, passiveWifiProbeRef };
  return {
    reconcileAfterMediaAction: reconcileAfterMediaAction.bind(undefined, context),
    stopPolling: stopPolling.bind(undefined, context),
    waitForStatusPoll: () => statusPollLoopRef.current.whenIdle(),
    startPollingLoop: startPollingLoop.bind(undefined, context),
  };
}
