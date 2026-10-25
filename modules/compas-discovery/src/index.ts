import { requireNativeModule, type EventSubscription } from 'expo-modules-core';

export interface DiscoveredWifiService {
  id: string;
  name: string;
  host: string;
  port: number;
  address: string;
  /** The advertised SRV target, such as r1.compas.local (Android 15 and later). */
  hostname?: string | null;
  apiVersion?: string;
}

export interface WifiServiceLostEvent {
  id: string;
  name: string;
}

export interface DiscoveryErrorEvent {
  errorCode: number;
  phase: string;
}

let nativeModule: any = null;
function getNativeModule() {
  if (!nativeModule) {
    try {
      nativeModule = requireNativeModule('CompasDiscovery');
    } catch {
      nativeModule = null;
    }
  }
  return nativeModule;
}

export async function startDiscovery(): Promise<boolean> {
  const mod = getNativeModule();
  if (!mod || !mod.startDiscovery) return false;
  return await mod.startDiscovery();
}

export async function stopDiscovery(): Promise<boolean> {
  const mod = getNativeModule();
  if (!mod || !mod.stopDiscovery) return false;
  return await mod.stopDiscovery();
}

export function addDeviceFoundListener(listener: (event: DiscoveredWifiService) => void): EventSubscription | null {
  const mod = getNativeModule();
  return mod?.addListener ? mod.addListener('onDeviceFound', listener) : null;
}

export function addDeviceLostListener(listener: (event: WifiServiceLostEvent) => void): EventSubscription | null {
  const mod = getNativeModule();
  return mod?.addListener ? mod.addListener('onDeviceLost', listener) : null;
}

export function addDiscoveryErrorListener(listener: (event: DiscoveryErrorEvent) => void): EventSubscription | null {
  const mod = getNativeModule();
  return mod?.addListener ? mod.addListener('onDiscoveryError', listener) : null;
}
