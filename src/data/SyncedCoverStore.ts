import * as FileSystem from 'expo-file-system/legacy';
import { sha256Sync, bytesToBase64, base64ToBytes } from './cryptoUtils';

export class SyncedCoverStore {
  readonly root: string;
  private memoryStore = new Map<string, string>(); // fallback

  constructor(root?: string) {
    const defaultRoot = FileSystem.documentDirectory || '';
    this.root = (root || `${defaultRoot}synced-covers`).replace(/\/+$/, '');
  }

  static digest(value: string): string {
    return sha256Sync(value);
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
    const base64 = this.memoryStore.get(this.memoryKey(libraryId, coverKey));
    return base64 ? `data:${mimeType};base64,${base64}` : null;
  }

  private memoryKey(libraryId: string, coverKey: string): string {
    return `${libraryId}\u0000${coverKey}`;
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
    return this.memoryStore.get(this.memoryKey(libraryId, coverKey)) || null;
  }

  async getBytes(libraryId: string, coverKey: string): Promise<Uint8Array | null> {
    const b64 = await this.get(libraryId, coverKey);
    return b64 ? base64ToBytes(b64) : null;
  }

  async contains(libraryId: string, coverKey: string): Promise<boolean> {
    if (!libraryId.trim() || !coverKey.trim()) return false;
    const target = this.fileFor(libraryId, coverKey);
    try {
      const info = await FileSystem.getInfoAsync(target);
      if (info.exists && (info.size || 0) > 0) return true;
    } catch {
      // fallback
    }
    return this.memoryStore.has(this.memoryKey(libraryId, coverKey));
  }

  async put(libraryId: string, coverKey: string, data: Uint8Array | string): Promise<boolean> {
    if (!libraryId.trim() || !coverKey.trim()) return false;
    const base64 = typeof data === 'string' ? data : bytesToBase64(data);
    if (!base64) return false;

    this.memoryStore.set(this.memoryKey(libraryId, coverKey), base64);
    const target = this.fileFor(libraryId, coverKey);
    const parentDir = target.substring(0, target.lastIndexOf('/'));
    const tempFile = `${parentDir}/.${Date.now()}.${Math.random().toString(36).substring(2)}.tmp`;

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
      return true; // memory store holds it
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
}
