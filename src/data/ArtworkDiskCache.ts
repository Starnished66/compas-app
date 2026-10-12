import * as FileSystem from 'expo-file-system/legacy';
import { sha256Sync, bytesToBase64, base64ToBytes } from './cryptoUtils';

export class ArtworkDiskCache {
  readonly directory: string;
  readonly maxEntries: number;
  readonly maxBytes: number;
  private memoryCache = new Map<string, string>(); // fallback memory cache

  constructor(
    directory?: string,
    maxEntries: number = 512,
    maxBytes: number = 64 * 1024 * 1024
  ) {
    if (maxEntries <= 0 || maxBytes <= 0) {
      throw new Error('maxEntries and maxBytes must be positive');
    }
    const defaultDir = FileSystem.cacheDirectory || FileSystem.documentDirectory || '';
    this.directory = (directory || `${defaultDir}compas-art-cache`).replace(/\/+$/, '');
    this.maxEntries = maxEntries;
    this.maxBytes = maxBytes;
  }

  static hashKey(key: string): string {
    const hash = sha256Sync(key);
    return hash.substring(0, 24);
  }

  private fileFor(key: string): string {
    const hash = ArtworkDiskCache.hashKey(key);
    return `${this.directory}/${hash}.art`;
  }

  async getUri(key: number | string): Promise<string | null> {
    if (typeof key === 'number') {
      if (key < 0) return null;
      return this.getUri(key.toString());
    }
    const target = this.fileFor(key);
    try {
      const info = await FileSystem.getInfoAsync(target);
      if (info.exists && !info.isDirectory) return target;
    } catch {
      // The in-memory copy is still usable if disk access fails.
    }
    const base64 = this.memoryCache.get(key);
    return base64 ? (base64.startsWith('data:') ? base64 : `data:image/jpeg;base64,${base64}`) : null;
  }

  async get(key: number | string): Promise<string | null> {
    if (typeof key === 'number') {
      if (key < 0) return null;
      return this.get(key.toString());
    }
    const target = this.fileFor(key);
    try {
      const info = await FileSystem.getInfoAsync(target);
      if (info.exists && !info.isDirectory) {
        return await FileSystem.readAsStringAsync(target, {
          encoding: FileSystem.EncodingType.Base64,
        });
      }
    } catch {
      // fallback
    }
    return this.memoryCache.get(key) || null;
  }

  async getBytes(key: number | string): Promise<Uint8Array | null> {
    const base64 = await this.get(key);
    return base64 ? base64ToBytes(base64) : null;
  }

  async put(key: number | string, data: Uint8Array | string): Promise<void> {
    if (typeof key === 'number') {
      if (key < 0) return;
      return this.put(key.toString(), data);
    }
    const base64 = typeof data === 'string' ? data : bytesToBase64(data);
    if (!key || !base64) return;

    this.memoryCache.set(key, base64);

    try {
      const dirInfo = await FileSystem.getInfoAsync(this.directory);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(this.directory, { intermediates: true });
      }

      const target = this.fileFor(key);
      const temporary = `${target}.tmp`;

      await FileSystem.writeAsStringAsync(temporary, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      await FileSystem.moveAsync({ from: temporary, to: target });
      this.memoryCache.delete(key);
      await this.trim();
    } catch {
      // memory cache already updated
    }
  }

  async store(key: string, write: (fileUri: string) => Promise<boolean>): Promise<string | null> {
    const target = this.fileFor(key);
    const temporary = `${target}.${Date.now()}.${Math.random().toString(36).substring(2)}.tmp`;
    try {
      await this.ensureDirectory();
      if (!(await write(temporary))) {
        await FileSystem.deleteAsync(temporary, { idempotent: true });
        return null;
      }
      await FileSystem.deleteAsync(target, { idempotent: true });
      await FileSystem.moveAsync({ from: temporary, to: target });
    } catch (error) {
      await FileSystem.deleteAsync(temporary, { idempotent: true }).catch(() => {});
      throw error;
    }
    void this.trim();
    return target;
  }

  private async ensureDirectory(): Promise<void> {
    const info = await FileSystem.getInfoAsync(this.directory);
    if (!info.exists) await FileSystem.makeDirectoryAsync(this.directory, { intermediates: true });
  }

  async clear(): Promise<void> {
    this.memoryCache.clear();
    try {
      await FileSystem.deleteAsync(this.directory, { idempotent: true });
    } catch {
      // ignore
    }
  }

  private async trim(): Promise<void> {
    try {
      const filenames = await FileSystem.readDirectoryAsync(this.directory);
      const artFiles = filenames.filter((name) => name.endsWith('.art'));

      const fileStats: { name: string; size: number; modificationTime: number }[] = [];
      for (const name of artFiles) {
        const info = await FileSystem.getInfoAsync(`${this.directory}/${name}`);
        if (info.exists) {
          fileStats.push({
            name,
            size: info.size || 0,
            modificationTime: (info as any).modificationTime || Date.now(),
          });
        }
      }

      fileStats.sort((a, b) => a.modificationTime - b.modificationTime);

      let total = fileStats.reduce((sum, f) => sum + f.size, 0);
      let count = fileStats.length;

      for (const file of fileStats) {
        if (count <= this.maxEntries && total <= this.maxBytes) break;
        total -= file.size;
        count--;
        await FileSystem.deleteAsync(`${this.directory}/${file.name}`, { idempotent: true });
      }
    } catch {
      // ignore
    }
  }
}
