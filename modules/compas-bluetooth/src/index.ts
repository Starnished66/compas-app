import { requireNativeModule, type EventSubscription } from 'expo-modules-core';
import {
  HttpRequest,
  HttpResponse,
  HttpTransport,
  ArtworkPreemptibleTransport,
  ArtworkRequestPreemptedException,
  isOptionalArtworkRequest,
  extractArtworkIndex,
} from '../../../src/data/HttpTransport';
import { base64ToBytes, bytesToBase64 } from '../../../src/data/cryptoUtils';

export interface BluetoothDeviceFoundEvent {
  id: string;
  name: string;
  paired: boolean;
  verified: boolean;
}

export interface BluetoothBondStateChangedEvent {
  id: string;
  name: string;
  paired: boolean;
  bonding: boolean;
  cancelled: boolean;
}

export interface DiscoveredBluetoothDevice {
  id: string;
  name: string;
  paired: boolean;
  bonding?: boolean;
}

export interface ArtworkPaletteResult {
  hue: number;
  saturation: number;
}

let nativeModule: any = null;
function getNativeModule() {
  if (!nativeModule) {
    try {
      nativeModule = requireNativeModule('CompasBluetooth');
    } catch {
      nativeModule = null;
    }
  }
  return nativeModule;
}

export async function getBondedDevices(): Promise<DiscoveredBluetoothDevice[]> {
  const mod = getNativeModule();
  if (!mod || !mod.getBondedDevices) return [];
  return await mod.getBondedDevices();
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

export async function pairDevice(deviceId: string): Promise<boolean> {
  const mod = getNativeModule();
  if (!mod || !mod.pairDevice) return false;
  return await mod.pairDevice(deviceId);
}

export async function preemptArtwork(index?: number | null): Promise<number> {
  const mod = getNativeModule();
  if (!mod || !mod.preemptArtwork) return 0;
  return await mod.preemptArtwork(index ?? null);
}

export async function extractArtworkPalette(source: string): Promise<ArtworkPaletteResult | null> {
  const mod = getNativeModule();
  if (!mod?.extractArtworkPalette) return null;
  return await mod.extractArtworkPalette(source);
}

export function addDeviceFoundListener(listener: (event: BluetoothDeviceFoundEvent) => void): EventSubscription | null {
  const mod = getNativeModule();
  return mod?.addListener ? mod.addListener('onDeviceFound', listener) : null;
}

export function addBondStateListener(listener: (event: BluetoothBondStateChangedEvent) => void): EventSubscription | null {
  const mod = getNativeModule();
  return mod?.addListener ? mod.addListener('onBondStateChanged', listener) : null;
}

export function addDiscoveryFinishedListener(listener: () => void): EventSubscription | null {
  const mod = getNativeModule();
  return mod?.addListener ? mod.addListener('onDiscoveryFinished', listener) : null;
}

export class BluetoothTransport implements HttpTransport, ArtworkPreemptibleTransport {
  constructor(private deviceId: string) {}

  async execute(request: HttpRequest): Promise<HttpResponse> {
    const isArt = isOptionalArtworkRequest(request.target);
    const artIndex = isArt ? extractArtworkIndex(request.target) : null;
    const mod = getNativeModule();
    if (!mod || !mod.executeRfcommRequest) {
      throw new Error('CompasBluetooth native module is not available');
    }

    try {
      const result = await mod.executeRfcommRequest(
        this.deviceId,
        request.method,
        request.target,
        request.headers || {},
        isArt,
        artIndex ?? null,
        request.body ? bytesToBase64(request.body) : null
      );

      const body = base64ToBytes(result.bodyBase64 || '');
      const resHeaders: Record<string, string> = {};
      if (result.headers) {
        for (const [k, v] of Object.entries(result.headers)) {
          resHeaders[k.toLowerCase()] = String(v);
        }
      }

      return {
        statusCode: result.statusCode,
        reason: result.reason || 'OK',
        headers: resHeaders,
        body,
        text() {
          return new TextDecoder('utf-8').decode(body);
        },
        header(name: string) {
          return resHeaders[name.toLowerCase()];
        },
      };
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (err?.code === 'ARTWORK_PREEMPTED' || msg.includes('preempted')) {
        throw new ArtworkRequestPreemptedException('Artwork request preempted', err);
      }
      throw err;
    }
  }

  preemptArtworkRequest(index?: number): void {
    const mod = getNativeModule();
    if (mod && mod.preemptArtwork) {
      mod.preemptArtwork(index ?? null).catch(() => {});
    }
  }
}
