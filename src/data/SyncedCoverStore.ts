import * as FileSystem from 'expo-file-system/legacy';
import { boundedMemo } from './boundedMemo';
import { bytesToBase64, base64ToBytes } from './cryptoUtils';
import { legacyCoverDigest } from './sha256';

const DIGEST_CACHE_LIMIT = 8192;
const cachedDigest = boundedMemo(legacyCoverDigest, DIGEST_CACHE_LIMIT);
const MEMORY_FALLBACK_LIMIT = 48;

export class SyncedCoverStore {
  readonly root: string;
  // Covers whose disk write failed, kept for display this session only; oldest use is evicted first.
  private memoryStore = new Map<string, string>();
  private activeTemporaries = new Set<string>();

  constructor(root?: string) {
    const defaultRoot = FileSystem.documentDirectory || '';
    this.root = (root || `${defaultRoot}synced-covers`).replace(/\/+$/, '');
  }

  static digest(value: string): string {
    return cachedDigest(value);
  }

  fileFor(libraryId: string, coverKey: string): string {
    const libHash = SyncedCoverStore.digest(libraryId);
    const coverHash = SyncedCoverStore.digest(coverKey);
    return `${this.root}/${libHash}/${coverHash}.cover`;
  }

  async getUri(libraryId: string, coverKey: string, mimeType: string = 'image/jpeg'): Promise<string | null> {
    if (!libraryId.trim() || !coverKey.trim()) return null;
    const target = this.fileFor(libraryId, coverKey);
    try {
      const info = await FileSystem.getInfoAsync(target);
      if (info.exists && !info.isDirectory && (info.size || 0) > 0) {
        return target.startsWith('file:') ? target : `file://${target}`;
      }
    } catch {
      // The in-memory copy is still usable if disk access fails.
    }
    const base64 = this.memoryGet(this.memoryKey(libraryId, coverKey));
    return base64 ? `data:${mimeType};base64,${base64}` : null;
  }

  private memoryKey(libraryId: string, coverKey: string): string {
    return `${libraryId}\u0000${coverKey}`;
  }

  private memoryGet(key: string): string | undefined {
    const base64 = this.memoryStore.get(key);
    if (base64 !== undefined) {
      this.memoryStore.delete(key);
      this.memoryStore.set(key, base64);
    }
    return base64;
  }

  private memorySet(key: string, base64: string): void {
    this.memoryStore.delete(key);
    if (this.memoryStore.size >= MEMORY_FALLBACK_LIMIT) {
      this.memoryStore.delete(this.memoryStore.keys().next().value as string);
    }
    this.memoryStore.set(key, base64);
  }

  async get(libraryId: string, coverKey: string): Promise<string | null> {
    if (!libraryId.trim() || !coverKey.trim()) return null;
    const target = this.fileFor(libraryId, coverKey);
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
    return this.memoryGet(this.memoryKey(libraryId, coverKey)) || null;
  }

  async getBytes(libraryId: string, coverKey: string): Promise<Uint8Array | null> {
    const b64 = await this.get(libraryId, coverKey);
    return b64 ? base64ToBytes(b64) : null;
  }

  /** True only when the cover is durably on disk; a memory-only fallback copy still needs a retry. */
  async contains(libraryId: string, coverKey: string): Promise<boolean> {
    if (!libraryId.trim() || !coverKey.trim()) return false;
    const target = this.fileFor(libraryId, coverKey);
    try {
      const info = await FileSystem.getInfoAsync(target);
      return Boolean(info.exists && (info.size || 0) > 0);
    } catch {
      return false;
    }
  }

  /**
   * Writes the cover to disk. Returns false when it could not be stored durably; the data then stays in a
   * small memory fallback for display, and the caller should leave the cover retryable.
   */
  async put(libraryId: string, coverKey: string, data: Uint8Array | string): Promise<boolean> {
    if (!libraryId.trim() || !coverKey.trim()) return false;
    const base64 = typeof data === 'string' ? data : bytesToBase64(data);
    if (!base64) return false;

    this.memorySet(this.memoryKey(libraryId, coverKey), base64);
    const target = this.fileFor(libraryId, coverKey);
    const parentDir = target.substring(0, target.lastIndexOf('/'));
    const tempFile = `${parentDir}/.${Date.now()}.${Math.random().toString(36).substring(2)}.tmp`;
    this.activeTemporaries.add(tempFile);

    try {
      const dirInfo = await FileSystem.getInfoAsync(parentDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(parentDir, { intermediates: true });
      }

      await FileSystem.writeAsStringAsync(tempFile, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      await FileSystem.moveAsync({ from: tempFile, to: target });
      const readBack = await FileSystem.getInfoAsync(target);
      const stored = Boolean(readBack.exists && (readBack.size || 0) > 0);
      if (stored) this.memoryStore.delete(this.memoryKey(libraryId, coverKey));
      return stored;
    } catch {
      try {
        await FileSystem.deleteAsync(tempFile, { idempotent: true });
      } catch {
        // ignore
      }
      return false;
    } finally {
      this.activeTemporaries.delete(tempFile);
    }
  }

  async delete(libraryId: string, coverKey: string): Promise<void> {
    if (!libraryId.trim() || !coverKey.trim()) return;
    this.memoryStore.delete(this.memoryKey(libraryId, coverKey));
    const target = this.fileFor(libraryId, coverKey);
    try {
      await FileSystem.deleteAsync(target, { idempotent: true });
    } catch {
      // ignore
    }
  }

  /**
   * Deletes this library's cover files whose key is not in keepCoverKeys, plus stale temporary files.
   * Call it only with a complete cover manifest. Returns the number of files removed.
   */
  async pruneLibrary(libraryId: string, keepCoverKeys: Iterable<string>): Promise<number> {
    const libraryHash = libraryId.trim() ? SyncedCoverStore.digest(libraryId) : '';
    if (!libraryHash) return 0;
    const keepKeys = Array.from(keepCoverKeys);
    const keep = new Set(keepKeys.map((key) => `${SyncedCoverStore.digest(key)}.cover`));
    const memoryKeep = new Set(keepKeys.map((key) => this.memoryKey(libraryId, key)));
    const prefix = `${libraryId}\u0000`;
    for (const key of Array.from(this.memoryStore.keys())) {
      if (key.startsWith(prefix) && !memoryKeep.has(key)) this.memoryStore.delete(key);
    }

    const directory = `${this.root}/${libraryHash}`;
    let names: string[];
    try {
      names = await FileSystem.readDirectoryAsync(directory);
    } catch {
      return 0;
    }
    let removed = 0;
    for (const name of names) {
      const uri = `${directory}/${name}`;
      const stale = name.endsWith('.tmp') ? !this.activeTemporaries.has(uri) : name.endsWith('.cover') && !keep.has(name);
      if (!stale) continue;
      try {
        await FileSystem.deleteAsync(uri, { idempotent: true });
        removed++;
      } catch {
        // ignore; the next prune retries
      }
    }
    return removed;
  }

  /** Deletes the cover directories of every library not listed. Returns the number of directories removed. */
  async purgeLibrariesExcept(libraryIds: Iterable<string>): Promise<number> {
    const keepIds = Array.from(libraryIds);
    const keep = new Set(keepIds.map((id) => SyncedCoverStore.digest(id)));
    const keepMemory = new Set(keepIds);
    for (const key of Array.from(this.memoryStore.keys())) {
      if (!keepMemory.has(key.substring(0, key.indexOf('\u0000')))) this.memoryStore.delete(key);
    }

    let names: string[];
    try {
      names = await FileSystem.readDirectoryAsync(this.root);
    } catch {
      return 0;
    }
    let removed = 0;
    for (const name of names) {
      if (keep.has(name)) continue;
      try {
        await FileSystem.deleteAsync(`${this.root}/${name}`, { idempotent: true });
        removed++;
      } catch {
        // ignore; the next purge retries
      }
    }
    return removed;
  }
}
