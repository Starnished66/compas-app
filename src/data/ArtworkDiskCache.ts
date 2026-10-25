import * as FileSystem from 'expo-file-system/legacy';
import { sha256Sync, bytesToBase64, base64ToBytes } from './cryptoUtils';

const MEMORY_FALLBACK_LIMIT = 32;

interface IndexEntry {
  size: number;
}

export class ArtworkDiskCache {
  readonly directory: string;
  readonly maxEntries: number;
  readonly maxBytes: number;
  private memoryCache = new Map<string, string>(); // fallback memory cache, used only when disk writes fail
  // Built once from the directory, then kept current by writes and read hits. Map order is LRU (oldest first).
  private index: Map<string, IndexEntry> | null = null;
  private indexLoad: Promise<Map<string, IndexEntry>> | null = null;
  private indexBytes = 0;
  private trimRunning: Promise<void> | null = null;
  private trimAgain = false;
  private activeTemporaries = new Set<string>();

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
    return `${this.directory}/${this.nameFor(key)}`;
  }

  private nameFor(key: string): string {
    return `${ArtworkDiskCache.hashKey(key)}.art`;
  }

  private temporaryFor(target: string): string {
    return `${target}.${Date.now()}.${Math.random().toString(36).substring(2)}.tmp`;
  }

  async getUri(key: number | string): Promise<string | null> {
    if (typeof key === 'number') {
      if (key < 0) return null;
      return this.getUri(key.toString());
    }
    const target = this.fileFor(key);
    try {
      const info = await FileSystem.getInfoAsync(target);
      if (info.exists && !info.isDirectory) {
        this.touch(this.nameFor(key));
        return target;
      }
      this.forget(this.nameFor(key));
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
        const base64 = await FileSystem.readAsStringAsync(target, {
          encoding: FileSystem.EncodingType.Base64,
        });
        this.touch(this.nameFor(key));
        return base64;
      }
      this.forget(this.nameFor(key));
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

    this.rememberInMemory(key, base64);

    const target = this.fileFor(key);
    const temporary = this.temporaryFor(target);
    this.activeTemporaries.add(temporary);
    try {
      await this.ensureDirectory();
      await FileSystem.writeAsStringAsync(temporary, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      await FileSystem.moveAsync({ from: temporary, to: target });
      this.memoryCache.delete(key);
      // Base64 expands 3 bytes into 4 characters; close enough for the byte budget.
      void this.recordWrite(this.nameFor(key), Math.floor((base64.length * 3) / 4));
    } catch {
      // memory cache already updated
      await FileSystem.deleteAsync(temporary, { idempotent: true }).catch(() => {});
    } finally {
      this.activeTemporaries.delete(temporary);
    }
  }

  private rememberInMemory(key: string, base64: string): void {
    this.memoryCache.delete(key);
    if (this.memoryCache.size >= MEMORY_FALLBACK_LIMIT) {
      this.memoryCache.delete(this.memoryCache.keys().next().value as string);
    }
    this.memoryCache.set(key, base64);
  }

  async store(key: string, write: (fileUri: string) => Promise<boolean>): Promise<string | null> {
    const target = this.fileFor(key);
    const temporary = this.temporaryFor(target);
    this.activeTemporaries.add(temporary);
    let size = 0;
    try {
      await this.ensureDirectory();
      if (!(await write(temporary))) {
        await FileSystem.deleteAsync(temporary, { idempotent: true });
        return null;
      }
      const info = await FileSystem.getInfoAsync(temporary);
      size = info.exists ? info.size || 0 : 0;
      await FileSystem.deleteAsync(target, { idempotent: true });
      await FileSystem.moveAsync({ from: temporary, to: target });
    } catch (error) {
      await FileSystem.deleteAsync(temporary, { idempotent: true }).catch(() => {});
      throw error;
    } finally {
      this.activeTemporaries.delete(temporary);
    }
    void this.recordWrite(this.nameFor(key), size);
    return target;
  }

  private async ensureDirectory(): Promise<void> {
    const info = await FileSystem.getInfoAsync(this.directory);
    if (!info.exists) await FileSystem.makeDirectoryAsync(this.directory, { intermediates: true });
  }

  async clear(): Promise<void> {
    this.memoryCache.clear();
    this.index = null;
    this.indexLoad = null;
    this.indexBytes = 0;
    try {
      await FileSystem.deleteAsync(this.directory, { idempotent: true });
    } catch {
      // ignore
    }
  }

  private loadIndex(): Promise<Map<string, IndexEntry>> {
    if (this.index) return Promise.resolve(this.index);
    if (!this.indexLoad) {
      const load = this.readIndex().then((index) => {
        // clear() during the scan invalidates it.
        if (this.indexLoad !== load) return index;
        this.index = index;
        this.indexBytes = 0;
        for (const entry of index.values()) this.indexBytes += entry.size;
        return index;
      });
      this.indexLoad = load;
      load.catch(() => {
        if (this.indexLoad === load) this.indexLoad = null;
      });
    }
    return this.indexLoad;
  }

  private async readIndex(): Promise<Map<string, IndexEntry>> {
    let filenames: string[] = [];
    try {
      filenames = await FileSystem.readDirectoryAsync(this.directory);
    } catch {
      return new Map();
    }
    const stats: { name: string; size: number; modificationTime: number }[] = [];
    for (const name of filenames) {
      const uri = `${this.directory}/${name}`;
      if (name.endsWith('.tmp')) {
        // Left behind by an interrupted write.
        if (!this.activeTemporaries.has(uri)) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
        continue;
      }
      if (!name.endsWith('.art')) continue;
      try {
        const info = await FileSystem.getInfoAsync(uri);
        if (info.exists && !info.isDirectory) {
          stats.push({ name, size: info.size || 0, modificationTime: info.modificationTime || 0 });
        }
      } catch {
        // skip unreadable entries
      }
    }
    // File times seed the order on first load; reads and writes keep it current afterwards.
    stats.sort((a, b) => a.modificationTime - b.modificationTime);
    return new Map(stats.map((stat) => [stat.name, { size: stat.size }]));
  }

  private touch(name: string): void {
    const entry = this.index?.get(name);
    if (!entry || !this.index) return;
    this.index.delete(name);
    this.index.set(name, entry);
  }

  private forget(name: string): void {
    const entry = this.index?.get(name);
    if (!entry || !this.index) return;
    this.index.delete(name);
    this.indexBytes -= entry.size;
  }

  private async recordWrite(name: string, size: number): Promise<void> {
    try {
      const index = await this.loadIndex();
      if (index !== this.index) return;
      this.forget(name);
      index.set(name, { size });
      this.indexBytes += size;
      if (this.overLimit()) await this.trim();
    } catch {
      // ignore
    }
  }

  private overLimit(): boolean {
    return !!this.index && (this.index.size > this.maxEntries || this.indexBytes > this.maxBytes);
  }

  /** Evicts least recently used files; concurrent requests coalesce into one more pass. */
  private trim(): Promise<void> {
    if (this.trimRunning) {
      this.trimAgain = true;
      return this.trimRunning;
    }
    const run = (async () => {
      do {
        this.trimAgain = false;
        const index = this.index;
        if (!index) return;
        const evicted: string[] = [];
        for (const name of index.keys()) {
          if (!this.overLimit()) break;
          evicted.push(name);
          this.forget(name);
        }
        for (const name of evicted) {
          await FileSystem.deleteAsync(`${this.directory}/${name}`, { idempotent: true }).catch(() => {});
        }
      } while (this.trimAgain);
    })();
    this.trimRunning = run.finally(() => {
      this.trimRunning = null;
    });
    return this.trimRunning;
  }
}
