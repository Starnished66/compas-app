/**
 * TypeScript adapter for Wi-Fi DNS-SD discovery of Compás players.
 */

import { Platform } from 'react-native';

let CompasDiscovery: any = null;
try {
  CompasDiscovery = require('../../modules/compas-discovery').default || require('../../modules/compas-discovery');
} catch {
  // Not linked in current runtime (e.g. tests or iOS)
}

export interface DiscoveredPlayer {
  id: string;
  name: string;
  address: string;
  host: string;
  port: number;
}

export class NativeDiscovery {
  static start(
    onDiscovered: (player: DiscoveredPlayer) => void,
    onLost: (id: string) => void
  ): () => void {
    if (Platform.OS !== 'android' || !CompasDiscovery?.startDiscovery) {
      return () => {};
    }

    let subDiscovered: any;
    let subLost: any;

    try {
      const EventEmitter = require('expo-modules-core').EventEmitter;
      const emitter = new EventEmitter(CompasDiscovery);
      subDiscovered = emitter.addListener('onPlayerDiscovered', (data: DiscoveredPlayer) => {
        onDiscovered(data);
      });
      subLost = emitter.addListener('onPlayerLost', (data: { id: string }) => {
        onLost(data.id);
      });
    } catch {
      // Fallback
    }

    CompasDiscovery.startDiscovery();

    return () => {
      CompasDiscovery?.stopDiscovery?.();
      subDiscovered?.remove?.();
      subLost?.remove?.();
    };
  }
}
