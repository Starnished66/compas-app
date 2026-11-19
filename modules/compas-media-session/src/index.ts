import { requireNativeModule, type EventSubscription } from 'expo-modules-core';

export interface MediaActionEvent {
  action: 'play' | 'pause' | 'toggle' | 'next' | 'previous' | 'seekTo' | 'setVolume';
  positionMs?: number;
  volume?: number;
}

export interface MediaMetadataUpdate {
  title: string;
  artist: string;
  album: string;
  durationMs: number;
  artworkUri?: string | null;
  /** Shown by Android as the output device in the media notification. */
  deviceName?: string | null;
}

export interface MediaPlaybackUpdate {
  isPlaying: boolean;
  positionMs: number;
  volume: number;
}

let nativeModule: any = null;
function getNativeModule() {
  if (!nativeModule) {
    try {
      nativeModule = requireNativeModule('CompasMediaSession');
    } catch {
      nativeModule = null;
    }
  }
  return nativeModule;
}

export async function updateMediaMetadata(update: MediaMetadataUpdate): Promise<boolean> {
  const mod = getNativeModule();
  if (!mod?.updateMetadata) return false;
  return await mod.updateMetadata({ ...update, artworkUri: update.artworkUri ?? null, deviceName: update.deviceName ?? null });
}

export async function updateMediaPlayback(update: MediaPlaybackUpdate): Promise<boolean> {
  const mod = getNativeModule();
  if (!mod?.updatePlayback) return false;
  return await mod.updatePlayback(update);
}

export async function clearMediaState(): Promise<boolean> {
  const mod = getNativeModule();
  if (!mod || !mod.clearState) return false;
  return await mod.clearState();
}

export async function startPlaybackService(message?: string): Promise<boolean> {
  const mod = getNativeModule();
  if (!mod || !mod.startPlaybackService) return false;
  return await mod.startPlaybackService(message ?? null);
}

export async function stopPlaybackService(): Promise<boolean> {
  const mod = getNativeModule();
  if (!mod || !mod.stopPlaybackService) return false;
  return await mod.stopPlaybackService();
}

export function addMediaActionListener(listener: (event: MediaActionEvent) => void): EventSubscription | null {
  const mod = getNativeModule();
  return mod?.addListener ? mod.addListener('onMediaAction', listener) : null;
}

/**
 * Fires every few seconds while the playback service runs. JS timers stop in the background,
 * so the status poll listens to this to keep the notification current.
 */
export function addBackgroundTickListener(listener: () => void): EventSubscription | null {
  const mod = getNativeModule();
  return mod?.addListener ? mod.addListener('onBackgroundTick', listener) : null;
}
