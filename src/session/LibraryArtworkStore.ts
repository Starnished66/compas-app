import { LibraryEntry } from '../data/types';

type Listener = () => void;

export const LIBRARY_ARTWORK_FLUSH_MS = 50;

export class LibraryArtworkStore {
  private readonly uris = new Map<string, string>();
  private readonly entryListeners = new Map<string, Set<Listener>>();
  private readonly listeners = new Set<Listener>();
  private readonly requested = new Set<string>();
  private pending = new Map<string, string>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly flushDelayMs = LIBRARY_ARTWORK_FLUSH_MS) {}

  get = (entryId: string): string | undefined => this.uris.get(entryId);

  has = (entryId: string): boolean => this.uris.has(entryId);

  claimRequest = (entryId: string): boolean => {
    if (this.uris.has(entryId) || this.requested.has(entryId)) return false;
    this.requested.add(entryId);
    return true;
  };

  artworkOf = (entry: LibraryEntry): string | null | undefined => this.uris.get(entry.id) ?? entry.artwork;

  firstArtwork = (entries: readonly LibraryEntry[], preferred?: LibraryEntry | null): string | undefined => {
    const preferredArtwork = preferred ? this.artworkOf(preferred) : null;
    if (preferredArtwork) return preferredArtwork;
    for (const entry of entries) {
      const artwork = this.artworkOf(entry);
      if (artwork) return artwork;
    }
    return undefined;
  };

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  subscribeToEntry = (entryId: string, listener: Listener): (() => void) => {
    let entryListeners = this.entryListeners.get(entryId);
    if (!entryListeners) {
      entryListeners = new Set();
      this.entryListeners.set(entryId, entryListeners);
    }
    entryListeners.add(listener);
    return () => {
      entryListeners.delete(listener);
      if (!entryListeners.size && this.entryListeners.get(entryId) === entryListeners) {
        this.entryListeners.delete(entryId);
      }
    };
  };

  queue(entryId: string, uri: string): void {
    this.pending.set(entryId, uri);
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => this.flush(), this.flushDelayMs);
  }

  flush(): void {
    this.cancelFlush();
    const updates = this.pending;
    this.pending = new Map();
    const changed: string[] = [];
    for (const [entryId, uri] of updates) {
      if (this.uris.get(entryId) === uri) continue;
      this.uris.set(entryId, uri);
      changed.push(entryId);
    }
    this.notify(changed);
  }

  clear(): void {
    this.cancelFlush();
    this.pending.clear();
    this.requested.clear();
    const removed = [...this.uris.keys()];
    this.uris.clear();
    this.notify(removed);
  }

  dispose(): void {
    this.cancelFlush();
    this.pending.clear();
  }

  private cancelFlush(): void {
    if (!this.flushTimer) return;
    clearTimeout(this.flushTimer);
    this.flushTimer = null;
  }

  private notify(entryIds: string[]): void {
    if (!entryIds.length) return;
    for (const entryId of entryIds) {
      const entryListeners = this.entryListeners.get(entryId);
      if (entryListeners) for (const listener of [...entryListeners]) listener();
    }
    for (const listener of [...this.listeners]) listener();
  }
}
