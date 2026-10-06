import { requireNativeModule, type EventSubscription } from 'expo-modules-core';

export interface MediaActionEvent {
  action: 'play' | 'pause' | 'toggle' | 'next' | 'previous' | 'seekTo' | 'setVolume';
  positionMs?: number;
  volume?: number;
}

export interface MediaStateUpdate {
  title: string;
  artist: string;
  album: string;
  durationMs: number;
  artworkUri?: string | null;
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

export async function updateMediaState(update: MediaStateUpdate): Promise<boolean> {
  const mod = getNativeModule();
  if (!mod || !mod.updateState) return false;
  return await mod.updateState({ ...update, artworkUri: update.artworkUri ?? null });
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
