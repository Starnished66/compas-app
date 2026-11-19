import * as FileSystem from 'expo-file-system/legacy';
import { sha256Sync, bytesToBase64, base64ToBytes } from './cryptoUtils';

const MEMORY_FALLBACK_LIMIT = 32;
const activeTemporaries = new Set<string>();
const directoryRevisions = new Map<string, number>();

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
  private indexLoad: Promise<void> | null = null;
  private indexBytes = 0;
  private indexGeneration = 0;
  private indexedRevision = 0;
  private trimRunning = false;
  private pendingTrim: (() => boolean) | null = null;

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

  async put(key: number | string, data: Uint8Array | string, ownsWrite: () => boolean = () => true): Promise<void> {
    if (typeof key === 'number') {
      if (key < 0) return;
      return this.put(key.toString(), data, ownsWrite);
    }
    const base64 = typeof data === 'string' ? data : bytesToBase64(data);
    if (!key || !base64 || !ownsWrite()) return;
    try {
      const target = await this.writeTemporary(key, async (temporary) => {
        await FileSystem.writeAsStringAsync(temporary, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        return true;
      }, ownsWrite, Math.floor((base64.length * 3) / 4));
      if (target && ownsWrite()) this.memoryCache.delete(key);
    } catch {
      if (ownsWrite()) this.rememberInMemory(key, base64);
    }
  }

  private rememberInMemory(key: string, base64: string): void {
    this.memoryCache.delete(key);
    if (this.memoryCache.size >= MEMORY_FALLBACK_LIMIT) {
      this.memoryCache.delete(this.memoryCache.keys().next().value as string);
    }
    this.memoryCache.set(key, base64);
  }

  store(
    key: string,
    write: (fileUri: string) => Promise<boolean>,
    ownsWrite: () => boolean,
  ): Promise<string | null> {
    return this.writeTemporary(key, write, ownsWrite);
  }

  private async writeTemporary(
    key: string,
    write: (fileUri: string) => Promise<boolean>,
    ownsWrite: () => boolean,
    size?: number,
  ): Promise<string | null> {
    if (!ownsWrite()) return null;
    const indexGeneration = this.indexGeneration;
    await this.ensureDirectory(ownsWrite);
    if (!ownsWrite()) return null;
    const target = this.fileFor(key);
    const temporary = this.temporaryFor(target);
    activeTemporaries.add(temporary);
    let moved = false;
    try {
      const written = await write(temporary);
      if (!ownsWrite() || !written) return null;
      if (size === undefined) {
        const info = await FileSystem.getInfoAsync(temporary);
        if (!ownsWrite()) return null;
        if (!info.exists || info.isDirectory || !info.size) throw new Error('Artwork download file is missing or empty');
        size = info.size;
      }
      if (!ownsWrite()) return null;
      await FileSystem.moveAsync({ from: temporary, to: target });
      moved = true;
      void this.recordWrite(this.nameFor(key), size, () => {
        try {
          return indexGeneration === this.indexGeneration && ownsWrite();
        } catch {
          return false;
        }
      });
      return ownsWrite() ? target : null;
    } finally {
      if (!moved) await FileSystem.deleteAsync(temporary, { idempotent: true }).catch(() => {});
      activeTemporaries.delete(temporary);
    }
  }

  private async ensureDirectory(ownsWrite: () => boolean): Promise<void> {
    const info = await FileSystem.getInfoAsync(this.directory);
    if (!info.exists && ownsWrite()) {
      await FileSystem.makeDirectoryAsync(this.directory, { intermediates: true });
    }
  }

  async clear(): Promise<void> {
    this.memoryCache.clear();
    this.indexGeneration++;
    this.resetIndex();
    try {
      await FileSystem.deleteAsync(this.directory, { idempotent: true });
    } catch {
      // ignore
    }
  }

  private resetIndex(): void {
    this.index = null;
    this.indexLoad = null;
    this.indexBytes = 0;
  }

  private directoryRevision(): number {
    return directoryRevisions.get(this.directory) ?? 0;
  }

  private currentIndex(): Map<string, IndexEntry> | null {
    const revision = this.directoryRevision();
    if (this.indexedRevision !== revision) {
      this.resetIndex();
      this.indexedRevision = revision;
    }
    return this.index;
  }

  private loadIndex(ownsWrite: () => boolean): Promise<void> {
    if (this.indexLoad) return this.indexLoad;
    const revision = this.indexedRevision;
    const ownsScan = () => this.indexLoad === load && revision === this.directoryRevision() && ownsWrite();
    const load: Promise<void> = this.readIndex(ownsScan).then((index) => {
      if (!index || !ownsScan()) return;
      this.index = index;
      this.indexBytes = 0;
      for (const entry of index.values()) this.indexBytes += entry.size;
    }).finally(() => {
      if (this.indexLoad === load) this.indexLoad = null;
    });
    this.indexLoad = load;
    return load;
  }

  private async readIndex(ownsScan: () => boolean): Promise<Map<string, IndexEntry> | null> {
    let filenames: string[] = [];
    try {
      filenames = await FileSystem.readDirectoryAsync(this.directory);
    } catch {
      return new Map();
    }
    const stats: { name: string; size: number; modificationTime: number }[] = [];
    for (const name of filenames) {
      if (!ownsScan()) return null;
      const uri = `${this.directory}/${name}`;
      if (name.endsWith('.tmp')) {
        // Left behind by an interrupted write.
        if (!activeTemporaries.has(uri)) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
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
    const index = this.currentIndex();
    const entry = index?.get(name);
    if (!index || !entry) return;
    index.delete(name);
    index.set(name, entry);
  }

  private forget(name: string): void {
    const entry = this.index?.get(name);
    if (!entry || !this.index) return;
    this.index.delete(name);
    this.indexBytes -= entry.size;
  }

  private async recordWrite(name: string, size: number, ownsWrite: () => boolean): Promise<void> {
    try {
      let index = this.currentIndex();
      while (ownsWrite() && !index) {
        await this.loadIndex(ownsWrite);
        index = this.currentIndex();
      }
      if (!ownsWrite() || !index) {
        // A late move can leave a file missing from the replacement session's index.
        directoryRevisions.set(this.directory, this.directoryRevision() + 1);
        return;
      }
      this.forget(name);
      index.set(name, { size });
      this.indexBytes += size;
      if (this.overLimit()) await this.trim(ownsWrite);
    } catch {
      // ignore
    }
  }

  private overLimit(): boolean {
    return !!this.index && (this.index.size > this.maxEntries || this.indexBytes > this.maxBytes);
  }

  /** Evicts least recently used files; concurrent requests coalesce into one more pass. */
  private async trim(ownsWrite: () => boolean): Promise<void> {
    this.pendingTrim = ownsWrite;
    if (this.trimRunning) return;
    this.trimRunning = true;
    try {
      while (this.pendingTrim) {
        const ownsTrim = this.pendingTrim;
        this.pendingTrim = null;
        const index = this.index;
        if (!index) continue;
        while (ownsTrim() && index === this.currentIndex() && this.overLimit()) {
          const name = index.keys().next().value!;
          this.forget(name);
          await FileSystem.deleteAsync(`${this.directory}/${name}`, { idempotent: true }).catch(() => {});
        }
      }
    } finally {
      this.trimRunning = false;
    }
  }
}
