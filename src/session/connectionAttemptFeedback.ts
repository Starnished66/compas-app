import { ConnectionStatus, ConnectionTransport } from '../data/types';
import { stopPlaybackService } from '../../modules/compas-media-session/src/index';
import type { ConnectionAttemptDependencies } from './connectionAttempts';

// Socket and HTTP errors from the transports are developer text; show the user what to check instead.
const connectFailureMessage = (err: any, transport: ConnectionTransport): string => {
  if (err?.message === 'Unsupported Compás protocol version') return 'This player’s Compás version isn’t supported. Update the app and the player.';
  return transport === ConnectionTransport.Bluetooth
    ? 'Could not reach the player over Bluetooth. Make sure it’s on, nearby and has Remote Control enabled.'
    : 'Could not reach the player on this network. Make sure it’s on, on the same Wi-Fi and has Remote Control enabled.';
};

export function createPinCooldown(deps: ConnectionAttemptDependencies) {
  const { pinCooldownTimerRef, setState } = deps.shared;

  const runPinCooldown = (seconds: number, pinInput: string = '') => {
    if (pinCooldownTimerRef.current) clearInterval(pinCooldownTimerRef.current);
    let remaining = seconds;
    setState((prev) => ({
      ...prev,
      connectionStatus: ConnectionStatus.Error,
      pinDialogVisible: true,
      pinInput,
      pinError: 'Too many attempts. Wait before entering another PIN.',
      pinRetryDelaySeconds: remaining,
      connectionMessage: `Too many PIN attempts. Try again in ${remaining}s.`,
    }));

    pinCooldownTimerRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        if (pinCooldownTimerRef.current) clearInterval(pinCooldownTimerRef.current);
        setState((prev) => ({
          ...prev,
          connectionStatus: ConnectionStatus.Error,
          pinRetryDelaySeconds: 0,
          connectionMessage: 'You can try the PIN again now.',
          pinError: null,
        }));
      } else {
        setState((prev) => ({
          ...prev,
          pinRetryDelaySeconds: remaining,
          connectionMessage: `Too many PIN attempts. Try again in ${remaining}s.`,
        }));
      }
    }, 1000);
  };

  return runPinCooldown;
}

export function createConnectionRejection(deps: ConnectionAttemptDependencies) {
  const { apiRef, setState, stateRef } = deps.shared;

  const rejectConnectChoice = (message: string): false => {
    if (apiRef.current && stateRef.current.connectionStatus === ConnectionStatus.Connected) {
      setState((prev) => ({ ...prev, connectionMessage: message }));
      return false;
    }
    stopPlaybackService().catch(() => {});
    setState((prev) => ({ ...prev, connectionStatus: ConnectionStatus.Error, connectionMessage: message }));
    return false;
  };

  return rejectConnectChoice;
}

export function createFailureHandler(
  deps: ConnectionAttemptDependencies, runPinCooldown: ReturnType<typeof createPinCooldown>,
  { scheduleAutoReconnect, pauseForBluetoothPairing }: { scheduleAutoReconnect: (delay: number) => void; pauseForBluetoothPairing: (error: unknown) => boolean },
) {
  const { autoReconnectEnabledRef, pinStoreRef, setState } = deps.shared;
  const { dropLiveSession } = deps;

  const handleConnectionFailure = async (
    err: any, transport: ConnectionTransport, playerKey: string, pinToUse: string | undefined,
    explicitPin: string | undefined, isCurrentAttempt: () => boolean,
  ) => {
    if (!isCurrentAttempt()) return false;
    dropLiveSession();
    if (transport === ConnectionTransport.Bluetooth && pauseForBluetoothPairing(err)) return false;
    const statusCode = err?.statusCode || err?.status;
    if (statusCode === 401) {
      if (pinToUse) await pinStoreRef.current.remove(playerKey);
      if (!isCurrentAttempt()) return false;
      stopPlaybackService().catch(() => {});
      setState((prev) => ({
        ...prev,
        connectionStatus: ConnectionStatus.Error,
        pinDialogVisible: true,
        pinError: explicitPin ? 'Incorrect PIN. Check the player screen.' : null,
        connectionMessage: 'PIN required. Enter the PIN shown on the player.',
      }));
      return false;
    } else if (statusCode === 429 && err?.pinRateLimited) {
      const seconds = Math.max(1, Math.min(3600, Number(err.retryAfterSeconds) || 60));
      runPinCooldown(seconds, explicitPin || '');
      return false;
    } else {
      setState((prev) => ({
        ...prev,
        connectionStatus: ConnectionStatus.Error,
        connectionMessage: connectFailureMessage(err, transport),
      }));
      if (autoReconnectEnabledRef.current) {
        scheduleAutoReconnect(15000);
      } else {
        stopPlaybackService().catch(() => {});
      }
      return false;
    }
  };

  return handleConnectionFailure;
}
