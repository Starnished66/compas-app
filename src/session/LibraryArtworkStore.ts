import { LibraryEntry } from '../data/types';
import { ArtworkReference, readArtwork } from '../data/MemoryArtworkCache';
import type { ArtworkTarget } from './artworkResolver';

type Listener = () => void;

interface PlaylistArtwork {
  artwork: ArtworkReference;
  target?: ArtworkTarget;
}

interface PendingArtwork {
  artwork: ArtworkReference;
  playlistKey?: string;
  representative?: PlaylistArtwork;
}

export interface DisplayedLibraryArtwork {
  entryId: string;
  reference: ArtworkReference;
  uri: string;
}

export const LIBRARY_ARTWORK_FLUSH_MS = 50;

export class LibraryArtworkStore {
  private readonly uris = new Map<string, ArtworkReference>();
  private artworkTargets = new WeakMap<() => string | null, ArtworkTarget>();
  private readonly playlists = new Map<string, PlaylistArtwork>();
  private readonly entryListeners = new Map<string, Set<Listener>>();
  private readonly listeners = new Set<Listener>();
  private requested = new Map<string, false | symbol>();
  private recovery = Promise.resolve();
  private pending = new Map<string, PendingArtwork>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly flushDelayMs = LIBRARY_ARTWORK_FLUSH_MS) {}

  get = (entryId: string): string | undefined => readArtwork(this.uris.get(entryId)) ?? undefined;

  has = (entryId: string): boolean => Boolean(this.get(entryId));

  getEntryArtwork(entry: LibraryEntry): string | null | undefined {
    if (entry.playlistKey) return entry.artwork ?? readArtwork(this.playlists.get(entry.playlistKey)?.artwork);
    return this.get(entry.id) ?? readArtwork(entry.artworkReference) ?? entry.artwork;
  }

  memoryArtworkReference = (entry: LibraryEntry): (() => string | null) | undefined => {
    const reference = entry.playlistKey
      ? this.playlists.get(entry.playlistKey)?.artwork
      : this.uris.get(entry.id) ?? entry.artworkReference;
    return typeof reference === 'function' ? reference : undefined;
  };

  playlistTarget = (key: string): ArtworkTarget | undefined => this.playlists.get(key)?.target;

  rememberPlaylistArtwork(key: string, artwork: ArtworkReference): void {
    if (this.playlists.get(key)?.artwork === artwork) return;
    const target = typeof artwork === 'function' ? this.artworkTargets.get(artwork) : undefined;
    if (target || (typeof artwork === 'string' && artwork.startsWith('file:'))) {
      this.playlists.set(key, { artwork, target });
      this.notify([], true);
    }
  }

  claimRequest = (entryId: string, recovering = false): boolean => {
    if (this.has(entryId) || this.requested.has(entryId)) return false;
    this.requested.set(entryId, recovering ? Symbol() : false);
    return true;
  };

  load(entryId: string, read: (recovery?: symbol) => Promise<void>): Promise<void> {
    const recovery = this.requested.get(entryId);
    if (!recovery) return read();
    // Let visible rows retain one recovered URI before the next recovery can evict it.
    const next = this.recovery.then(() => {
      if (this.ownsRecovery(entryId, recovery)) return read(recovery);
    });
    this.recovery = next.catch(() => {});
    return next;
  }

  releaseRequest(entryId: string): void {
    this.requested.delete(entryId);
  }

  ownsRecovery(entryId: string, recovery?: symbol): boolean {
    return recovery === undefined || this.requested.get(entryId) === recovery;
  }

  releaseRecovery(entryId: string, recovery?: symbol): void {
    if (recovery && this.ownsRecovery(entryId, recovery)) this.releaseRequest(entryId);
  }

  firstArtwork(
    entries: readonly LibraryEntry[],
    preferred?: LibraryEntry | null,
    retained?: DisplayedLibraryArtwork,
    previous?: DisplayedLibraryArtwork,
  ): DisplayedLibraryArtwork | undefined {
    const artworkFor = (entry: LibraryEntry) => {
      const reference = this.uris.get(entry.id) ?? entry.artworkReference ?? entry.artwork;
      if (!reference) return undefined;
      const matches = (artwork?: DisplayedLibraryArtwork) =>
        artwork?.entryId === entry.id && artwork.reference === reference;
      const uri = readArtwork(reference) ?? (matches(retained) ? retained?.uri : undefined);
      if (!uri) return undefined;
      if (matches(previous) && previous?.uri === uri) return previous;
      return { entryId: entry.id, reference, uri };
    };
    const preferredArtwork = preferred && artworkFor(preferred);
    if (preferredArtwork) return preferredArtwork;
    for (const entry of entries) {
      const artwork = artworkFor(entry);
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

  queue(entryId: string, artwork: ArtworkReference, target?: ArtworkTarget, playlistKey?: string): void {
    if (target && typeof artwork === 'function') this.artworkTargets.set(artwork, target);
    const representative = playlistKey ? this.playlists.get(playlistKey) : undefined;
    const update = { artwork, playlistKey, representative };
    if (typeof artwork === 'function' && this.requested.get(entryId)) {
      this.pending.delete(entryId);
      this.publish([[entryId, update]]);
      return;
    }
    this.pending.set(entryId, update);
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => this.flush(), this.flushDelayMs);
  }

  flush(): void {
    this.cancelFlush();
    const updates = this.pending;
    this.pending = new Map();
    this.publish(updates);
  }

  private publish(updates: Iterable<[string, PendingArtwork]>): void {
    const changed: string[] = [];
    let publishedMemory = false;
    for (const [entryId, { artwork, playlistKey, representative }] of updates) {
      this.releaseRequest(entryId);
      if (typeof artwork === 'function') publishedMemory = true;
      if (playlistKey) {
        // A playlist edit can change the representative before this batch publishes.
        if (!representative || this.playlists.get(playlistKey) !== representative) continue;
        this.playlists.set(playlistKey, { ...representative, artwork });
      } else {
        if (this.uris.get(entryId) === artwork) continue;
        this.uris.set(entryId, artwork);
      }
      changed.push(entryId);
    }
    this.notify(changed, publishedMemory);
  }

  clear(): void {
    this.dispose();
    const removed = [...this.uris.keys()];
    const hadPlaylistArtwork = this.playlists.size > 0;
    this.playlists.clear();
    this.artworkTargets = new WeakMap();
    this.uris.clear();
    this.notify(removed, hadPlaylistArtwork);
  }

  dispose(): void {
    this.cancelFlush();
    this.pending.clear();
    this.requested = new Map();
    this.recovery = Promise.resolve();
  }

  private cancelFlush(): void {
    if (!this.flushTimer) return;
    clearTimeout(this.flushTimer);
    this.flushTimer = null;
  }

  private notify(entryIds: string[], memoryMayHaveChanged: boolean): void {
    if (!entryIds.length && !memoryMayHaveChanged) return;
    for (const entryId of memoryMayHaveChanged ? [...this.entryListeners.keys()] : entryIds) {
      const entryListeners = this.entryListeners.get(entryId);
      if (entryListeners) for (const listener of [...entryListeners]) listener();
    }
    for (const listener of [...this.listeners]) listener();
  }
}
