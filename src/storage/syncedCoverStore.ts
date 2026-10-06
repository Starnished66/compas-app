/**
 * Persistent content-addressed cover storage for Compás Remote.
 * Direct port of SyncedCoverStore.kt.
 * Covers are stored under <root>/<digest(libraryId)>/<digest(coverKey)>.cover.
 */

// Portable synchronous SHA-256 implementation
function sha256Hex(ascii: string): string {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }

  const maxWord = Math.pow(2, 32);
  let i = 0, j = 0;
  let result = '';

  const words: number[] = [];
  const asciiBitLength = ascii.length * 8;

  const hash: number[] = [];
  const k: number[] = [];
  let primeCounter = 0;

  const isComposite: Record<number, number> = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) {
        isComposite[i] = candidate;
      }
      hash[primeCounter] = (Math.pow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (Math.pow(candidate, 1 / 3) * maxWord) | 0;
    }
  }

  ascii += '\x80';
  while ((ascii.length % 64) - 56) ascii += '\x00';
  for (i = 0; i < ascii.length; i++) {
    j = ascii.charCodeAt(i);
    if (j >> 8) return '';
    words[i >> 2] = (words[i >> 2] || 0) | (j << ((3 - (i % 4)) * 8));
  }
  words[words.length] = (asciiBitLength / maxWord) | 0;
  words[words.length] = asciiBitLength;

  for (j = 0; j < words.length; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = [...hash];

    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15] || 0,
        w2 = w[i - 2] || 0;
      const s0 = rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3);
      const s1 = rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10);
      w[i] =
        i < 16
          ? w[i] || 0
          : ((w[i - 16] || 0) + s0 + (w[i - 7] || 0) + s1) | 0;

      const h4 = hash[4] || 0;
      const h5 = hash[5] || 0;
      const h6 = hash[6] || 0;
      const h7 = hash[7] || 0;
      const h0 = hash[0] || 0;
      const h1 = hash[1] || 0;
      const h2 = hash[2] || 0;

      const ch = (h4 & h5) ^ (~h4 & h6);
      const temp1 =
        (h7 +
          (rightRotate(h4, 6) ^
            rightRotate(h4, 11) ^
            rightRotate(h4, 25)) +
          ch +
          (k[i] || 0) +
          (w[i] || 0)) |
        0;
      const maj =
        (h0 & h1) ^
        (h0 & h2) ^
        (h1 & h2);
      const temp2 =
        ((rightRotate(h0, 2) ^
          rightRotate(h0, 13) ^
          rightRotate(h0, 22)) +
          maj) |
        0;

      hash[7] = hash[6] || 0;
      hash[6] = hash[5] || 0;
      hash[5] = hash[4] || 0;
      hash[4] = ((hash[3] || 0) + temp1) | 0;
      hash[3] = hash[2] || 0;
      hash[2] = hash[1] || 0;
      hash[1] = hash[0] || 0;
      hash[0] = (temp1 + temp2) | 0;
    }

    for (i = 0; i < 8; i++) {
      hash[i] = ((hash[i] || 0) + (oldHash[i] || 0)) | 0;
    }
  }

  for (i = 0; i < 8; i++) {
    const byteVal = hash[i] || 0;
    for (let b = 3; b >= 0; b--) {
      const byte = (byteVal >>> (8 * b)) & 255;
      result += (byte < 16 ? '0' : '') + byte.toString(16);
    }
  }
  return result;
}

let FileSystemLegacy: typeof import('expo-file-system/legacy') | null = null;
try {
  FileSystemLegacy = require('expo-file-system/legacy');
} catch {
  // Not in native Expo runtime
}

export class SyncedCoverStore {
  private baseDir: string;
  private memoryStore = new Map<string, Uint8Array>();

  constructor(baseDir?: string) {
    if (baseDir) {
      this.baseDir = baseDir.endsWith('/') ? baseDir : `${baseDir}/`;
    } else if (FileSystemLegacy && FileSystemLegacy.documentDirectory) {
      this.baseDir = `${FileSystemLegacy.documentDirectory}synced-covers/`;
    } else {
      this.baseDir = '/synced-covers/';
    }
  }

  digest(value: string): string {
    return sha256Hex(value);
  }

  filePath(libraryId: string, coverKey: string): string {
    const libDigest = this.digest(libraryId);
    const keyDigest = this.digest(coverKey);
    return `${this.baseDir}${libDigest}/${keyDigest}.cover`;
  }

  getCoverUriSync(libraryId: string, coverKey: string): string {
    const path = this.filePath(libraryId, coverKey);
    return path.startsWith('file://') ? path : `file://${path}`;
  }

  async getCoverUri(libraryId: string, coverKey: string): Promise<string | null> {
    const has = await this.contains(libraryId, coverKey);
    if (!has) return null;
    return this.getCoverUriSync(libraryId, coverKey);
  }

  async contains(libraryId: string, coverKey: string): Promise<boolean> {
    if (!libraryId || !coverKey) return false;
    const path = this.filePath(libraryId, coverKey);

    if (FileSystemLegacy && typeof FileSystemLegacy.getInfoAsync === 'function') {
      try {
        const info = await FileSystemLegacy.getInfoAsync(path);
        return Boolean(info.exists && info.size && info.size > 0);
      } catch {
        // Fallback
      }
    }
    return this.memoryStore.has(path);
  }

  async getBytes(libraryId: string, coverKey: string): Promise<Uint8Array | null> {
    if (!libraryId || !coverKey) return null;
    const path = this.filePath(libraryId, coverKey);

    if (FileSystemLegacy && typeof FileSystemLegacy.readAsStringAsync === 'function') {
      try {
        const info = await FileSystemLegacy.getInfoAsync(path);
        if (info.exists && info.size && info.size > 0) {
          const base64 = await FileSystemLegacy.readAsStringAsync(path, {
            encoding: FileSystemLegacy.EncodingType.Base64,
          });
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          return bytes;
        }
      } catch {
        // Fallback
      }
    }
    return this.memoryStore.get(path) || null;
  }

  getUri(libraryId: string, coverKey: string): string {
    return this.filePath(libraryId, coverKey);
  }

  async put(libraryId: string, coverKey: string, bytes: Uint8Array): Promise<boolean> {
    if (!libraryId || !coverKey || bytes.length === 0) return false;
    const path = this.filePath(libraryId, coverKey);

    if (FileSystemLegacy && typeof FileSystemLegacy.writeAsStringAsync === 'function') {
      try {
        const dir = path.slice(0, path.lastIndexOf('/'));
        await FileSystemLegacy.makeDirectoryAsync(dir, { intermediates: true });

        // Convert bytes to base64
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]!);
        }
        const base64 = btoa(binary);

        const tmpPath = `${path}.${Date.now()}.tmp`;
        await FileSystemLegacy.writeAsStringAsync(tmpPath, base64, {
          encoding: FileSystemLegacy.EncodingType.Base64,
        });

        await FileSystemLegacy.moveAsync({ from: tmpPath, to: path });
        const info = await FileSystemLegacy.getInfoAsync(path);
        return Boolean(info.exists && info.size === bytes.length);
      } catch {
        // Fallback to memory
      }
    }

    this.memoryStore.set(path, bytes);
    return true;
  }

  async delete(libraryId: string, coverKey: string): Promise<void> {
    if (!libraryId || !coverKey) return;
    const path = this.filePath(libraryId, coverKey);

    if (FileSystemLegacy && typeof FileSystemLegacy.deleteAsync === 'function') {
      try {
        await FileSystemLegacy.deleteAsync(path, { idempotent: true });
      } catch {
        // Fallback
      }
    }
    this.memoryStore.delete(path);
  }
}
