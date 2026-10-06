/**
 * TypeScript adapter for Android MediaSession and remote playback controls.
 */

import { Platform } from 'react-native';

let CompasMediaSession: any = null;
try {
  CompasMediaSession = require('../../modules/compas-media-session').default || require('../../modules/compas-media-session');
} catch {
  // Not linked in current runtime (e.g. tests or iOS)
}

export type MediaAction = 'play' | 'pause' | 'next' | 'previous' | 'seek' | 'volume';

export interface MediaActionEvent {
  action: MediaAction;
  value?: number;
}

export class NativeMediaSession {
  private static isInitialized = false;

  static init(onAction: (event: MediaActionEvent) => void): () => void {
    if (Platform.OS !== 'android' || !CompasMediaSession?.initSession) {
      return () => {};
    }

    if (!this.isInitialized) {
      CompasMediaSession.initSession();
      this.isInitialized = true;
    }

    let sub: any;
    try {
      const EventEmitter = require('expo-modules-core').EventEmitter;
      const emitter = new EventEmitter(CompasMediaSession);
      sub = emitter.addListener('onMediaAction', (data: MediaActionEvent) => {
        onAction(data);
      });
    } catch {
      // Fallback
    }

    return () => {
      sub?.remove?.();
    };
  }

  static update(trackData: {
    title: string;
    artist: string;
    album: string;
    isPlaying: boolean;
    positionMs: number;
    durationMs: number;
    volume: number;
    artworkPath?: string | null;
  }): void {
    if (Platform.OS !== 'android' || !CompasMediaSession?.updatePlaybackState) {
      return;
    }
    CompasMediaSession.updatePlaybackState(trackData);
  }

  static clear(): void {
    if (Platform.OS !== 'android' || !CompasMediaSession?.clearPlaybackState) {
      return;
    }
    CompasMediaSession.clearPlaybackState();
  }
}
