import * as Crypto from 'expo-crypto';
import { legacyCoverDigest } from './sha256';

export { legacyCoverDigest as sha256Sync } from './sha256';

export async function sha256Async(value: string): Promise<string> {
  try {
    return await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);
  } catch {
    return legacyCoverDigest(value);
  }
}

export function bytesToBase64(bytes: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let base64 = '';
  const len = bytes.length;
  let i = 0;

  for (; i + 2 < len; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    base64 += chars[a >> 2];
    base64 += chars[((a & 3) << 4) | (b >> 4)];
    base64 += chars[((b & 15) << 2) | (c >> 6)];
    base64 += chars[c & 63];
  }

  if (i < len) {
    const a = bytes[i];
    base64 += chars[a >> 2];
    if (i + 1 < len) {
      const b = bytes[i + 1];
      base64 += chars[((a & 3) << 4) | (b >> 4)];
      base64 += chars[(b & 15) << 2];
      base64 += '=';
    } else {
      base64 += chars[(a & 3) << 4];
      base64 += '==';
    }
  }

  return base64;
}

export function base64ToBytes(base64: string): Uint8Array {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const len = clean.length;
  const byteLength = Math.floor((len * 3) / 4);
  const bytes = new Uint8Array(byteLength);

  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const a = chars.indexOf(clean[i]);
    const b = chars.indexOf(clean[i + 1]);
    const c = chars.indexOf(clean[i + 2]);
    const d = chars.indexOf(clean[i + 3]);

    if (a >= 0 && b >= 0) bytes[p++] = (a << 2) | (b >> 4);
    if (c >= 0 && b >= 0 && p < byteLength) bytes[p++] = ((b & 15) << 4) | (c >> 2);
    if (d >= 0 && c >= 0 && p < byteLength) bytes[p++] = ((c & 3) << 6) | d;
  }

  return bytes.slice(0, p);
}
