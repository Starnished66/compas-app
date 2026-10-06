import { ConnectionTransport, RemoteScreen } from '../data/types';

export class BluetoothRequestPolicy {
  static readonly STATUS_POLL_INTERVAL_MS = 5000;
  static readonly QUEUE_POLL_INTERVAL_MS = 30000;
  static readonly ARTWORK_MIN_INTERVAL_MS = 5000;

  static requiresBluetoothAudioPriority(
    transport: ConnectionTransport,
    bluetoothAudioOutput?: boolean | null
  ): boolean {
    return transport === ConnectionTransport.Bluetooth && bluetoothAudioOutput !== false;
  }

  static enteredBluetoothAudioPriority(
    transport: ConnectionTransport,
    previousBluetoothAudioOutput?: boolean | null,
    currentBluetoothAudioOutput?: boolean | null
  ): boolean {
    return (
      !BluetoothRequestPolicy.requiresBluetoothAudioPriority(transport, previousBluetoothAudioOutput) &&
      BluetoothRequestPolicy.requiresBluetoothAudioPriority(transport, currentBluetoothAudioOutput)
    );
  }

  static leftBluetoothAudioPriority(
    transport: ConnectionTransport,
    previousBluetoothAudioOutput?: boolean | null,
    currentBluetoothAudioOutput?: boolean | null
  ): boolean {
    return (
      BluetoothRequestPolicy.requiresBluetoothAudioPriority(transport, previousBluetoothAudioOutput) &&
      !BluetoothRequestPolicy.requiresBluetoothAudioPriority(transport, currentBluetoothAudioOutput)
    );
  }

  static needsForegroundRecoveryAfterPriorityEntry(
    transport: ConnectionTransport,
    activityForeground: boolean,
    previousBluetoothAudioOutput?: boolean | null,
    currentBluetoothAudioOutput?: boolean | null
  ): boolean {
    return (
      !activityForeground &&
      BluetoothRequestPolicy.enteredBluetoothAudioPriority(
        transport,
        previousBluetoothAudioOutput,
        currentBluetoothAudioOutput
      )
    );
  }

  static allowsPassiveRequests(
    transport: ConnectionTransport,
    activityForeground: boolean,
    bluetoothAudioOutput?: boolean | null
  ): boolean {
    return !BluetoothRequestPolicy.requiresBluetoothAudioPriority(transport, bluetoothAudioOutput) || activityForeground;
  }

  static allowsActionReconciliation(
    transport: ConnectionTransport,
    activityForeground: boolean,
    bluetoothAudioOutput?: boolean | null
  ): boolean {
    return BluetoothRequestPolicy.requiresBluetoothAudioPriority(transport, bluetoothAudioOutput) && !activityForeground;
  }

  static statusPollInterval(
    transport: ConnectionTransport,
    wifiIntervalMs: number,
    bluetoothAudioOutput?: boolean | null
  ): number {
    return BluetoothRequestPolicy.requiresBluetoothAudioPriority(transport, bluetoothAudioOutput)
      ? BluetoothRequestPolicy.STATUS_POLL_INTERVAL_MS
      : wifiIntervalMs;
  }

  static queuePollInterval(
    transport: ConnectionTransport,
    screen: RemoteScreen,
    wifiIntervalMs: number,
    bluetoothAudioOutput?: boolean | null
  ): number | null {
    if (!BluetoothRequestPolicy.requiresBluetoothAudioPriority(transport, bluetoothAudioOutput)) {
      return wifiIntervalMs;
    }
    if (screen.type === 'Queue') {
      return BluetoothRequestPolicy.QUEUE_POLL_INTERVAL_MS;
    }
    return null;
  }

  static allowsArtworkRequest(
    transport: ConnectionTransport,
    isPlaying: boolean,
    bluetoothAudioOutput?: boolean | null
  ): boolean {
    return !BluetoothRequestPolicy.requiresBluetoothAudioPriority(transport, bluetoothAudioOutput) || !isPlaying;
  }

  static artworkMinIntervalMs(
    transport: ConnectionTransport,
    bluetoothAudioOutput?: boolean | null
  ): number {
    return BluetoothRequestPolicy.requiresBluetoothAudioPriority(transport, bluetoothAudioOutput)
      ? BluetoothRequestPolicy.ARTWORK_MIN_INTERVAL_MS
      : 0;
  }
}
