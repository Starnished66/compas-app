/**
 * TypeScript adapter for Compás Bluetooth Classic RFCOMM transport and discovery.
 */

import { Platform } from 'react-native';
import {
  HttpTransport,
  HttpRequest,
  HttpResponse,
  ArtworkPreemptibleTransport,
  isOptionalArtworkRequest,
} from '../core/transport';
import { ArtworkRequestPreemptedException } from '../core/errors';

let CompasBluetooth: any = null;
try {
  CompasBluetooth = require('../../modules/compas-bluetooth').default || require('../../modules/compas-bluetooth');
} catch {
  // Not linked in current runtime (e.g. tests or iOS)
}

export interface BluetoothPeer {
  address: string;
  name: string;
  paired: boolean;
  bonding?: boolean;
}

export class BluetoothRfcommTransport implements HttpTransport, ArtworkPreemptibleTransport {
  readonly deviceAddress: string;

  constructor(deviceAddress: string) {
    this.deviceAddress = deviceAddress;
  }

  preemptArtworkRequest(_index?: number): void {
    if (Platform.OS === 'android' && CompasBluetooth?.preemptArtwork) {
      CompasBluetooth.preemptArtwork(this.deviceAddress);
    }
  }

  async execute(request: HttpRequest): Promise<HttpResponse> {
    if (Platform.OS !== 'android' || !CompasBluetooth) {
      throw new Error(
        'Bluetooth Classic RFCOMM transport is an Android capability; use Wi-Fi transport on iOS and web.'
      );
    }

    const isArtwork = isOptionalArtworkRequest(request.target);
    try {
      const res = await CompasBluetooth.executeRfcommRequest(
        this.deviceAddress,
        request.method,
        request.target,
        request.headers || {},
        isArtwork
      );

      const base64: string = res.bodyBase64 || '';
      let bytes = new Uint8Array(0);
      if (base64) {
        const binary = atob(base64);
        bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
      }

      return new HttpResponse(
        res.statusCode,
        res.reason || '',
        res.headers || {},
        bytes
      );
    } catch (err: any) {
      if (err.message && err.message.includes('preempted')) {
        throw new ArtworkRequestPreemptedException(err.message);
      }
      throw err;
    }
  }

  static async pairDevice(address: string): Promise<boolean> {
    if (Platform.OS !== 'android' || !CompasBluetooth?.pairDevice) {
      return false;
    }
    return Boolean(await CompasBluetooth.pairDevice(address));
  }

  static async getBondedDevices(): Promise<BluetoothPeer[]> {
    if (Platform.OS !== 'android' || !CompasBluetooth?.getBondedDevices) {
      return [];
    }
    const list = await CompasBluetooth.getBondedDevices();
    return (list || []).map((item: any) => ({
      address: item.address,
      name: item.name,
      paired: item.paired === 'true' || item.paired === true,
      bonding: false,
    }));
  }

  static startScan(
    onFound: (peer: BluetoothPeer) => void,
    onFinished: () => void,
    onBondChanged?: (peer: BluetoothPeer) => void
  ): () => void {
    if (Platform.OS !== 'android' || !CompasBluetooth?.startScan) {
      onFinished();
      return () => {};
    }

    let subFound: any;
    let subFinished: any;
    let subBond: any;

    try {
      const EventEmitter = require('expo-modules-core').EventEmitter;
      const emitter = new EventEmitter(CompasBluetooth);
      subFound = emitter.addListener('onDeviceFound', (data: any) => {
        onFound({
          address: data.address,
          name: data.name,
          paired: Boolean(data.paired),
          bonding: Boolean(data.bonding),
        });
      });
      subBond = emitter.addListener('onBondStateChanged', (data: any) => {
        onBondChanged?.({
          address: data.address,
          name: data.name,
          paired: Boolean(data.paired),
          bonding: Boolean(data.bonding),
        });
      });
      subFinished = emitter.addListener('onScanFinished', () => {
        onFinished();
      });
    } catch {
      // Fallback
    }

    CompasBluetooth.startScan();

    return () => {
      CompasBluetooth?.stopScan?.();
      subFound?.remove?.();
      subBond?.remove?.();
      subFinished?.remove?.();
    };
  }
}
