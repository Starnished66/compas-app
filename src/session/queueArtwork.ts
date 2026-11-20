import type { ArtworkReference } from '../data/MemoryArtworkCache';
import { readArtwork } from '../data/MemoryArtworkCache';
import type { RemoteTrack } from '../data/types';
import { ArtworkSources, resolveArtworkReference } from './artworkResolver';

export const QUEUE_ARTWORK_FLUSH_MS = 120;

interface QueueArtworkRequest {
  sources: ArtworkSources;
  fileUris: Map<number, string>;
  readAlbumKeys: (indexes: number[]) => Promise<Map<number, string> | null>;
  allowsNetwork: () => boolean;
  publish: (index: number, reference: ArtworkReference) => void;
}

class QueueArtworkWork {
  readonly queued = new Map<number, { retry: boolean }>();
  private background: Promise<void> | null = null;
  private retries: Promise<void> | null = null;

  async runBackground(read: () => Promise<void>): Promise<void> {
    while (this.retries || this.background) await (this.retries ?? this.background);
    this.background = read();
    try {
      await this.background;
    } finally {
      this.background = null;
    }
  }

  async runRetry(read: () => Promise<void>): Promise<void> {
    const previous = this.retries ?? this.background;
    const next = Promise.resolve(previous).then(read);
    this.retries = next;
    try {
      await next;
    } finally {
      if (this.retries === next) this.retries = null;
    }
  }
}

export class QueueArtworkLoader {
  private readonly inFlight = new WeakMap<ArtworkSources['coverUrisByAlbum'], QueueArtworkWork>();

  async load(indexes: number[], request: QueueArtworkRequest, retry = false): Promise<void> {
    const { sources, fileUris, readAlbumKeys } = request;
    if (!sources.isCurrent?.()) return;
    let work = this.inFlight.get(sources.coverUrisByAlbum);
    if (!work) {
      work = new QueueArtworkWork();
      this.inFlight.set(sources.coverUrisByAlbum, work);
    }
    const { queued } = work;
    const owner = { retry };
    const pending = [...new Set(indexes)].filter((index) => {
      const previous = queued.get(index);
      return index >= 0 && !fileUris.has(index) && (!previous || (retry && !previous.retry));
    });
    if (!pending.length) return;
    pending.forEach((index) => queued.set(index, owner));
    const release = (index: number) => {
      if (queued.get(index) === owner) queued.delete(index);
    };
    const load = async () => {
      if (!sources.isCurrent?.()) return;
      const albumKeys = await readAlbumKeys(pending);
      const albumArt = new Map<string, ArtworkReference | null>();
      for (const songIndex of pending) {
        if (!sources.isCurrent?.()) return;
        const read = async () => {
          if (queued.get(songIndex) === owner && !fileUris.has(songIndex)) {
            await this.read(songIndex, albumKeys?.get(songIndex), albumArt, request, retry);
          }
        };
        await (retry ? read() : work.runBackground(read));
        release(songIndex);
      }
    };
    try {
      await (retry ? work.runRetry(load) : load());
    } finally {
      pending.forEach(release);
    }
  }

  private async read(
    songIndex: number,
    albumKey: string | undefined,
    albumArt: Map<string, ArtworkReference | null>,
    { sources, publish, allowsNetwork }: QueueArtworkRequest,
    retry: boolean,
  ): Promise<void> {
    if (!sources.isCurrent?.()) return;
    const cached = albumKey ? albumArt.get(albumKey) : undefined;
    if (albumKey && (cached === undefined || (typeof cached === 'function' && !readArtwork(cached)))) {
      albumArt.set(albumKey, await resolveArtworkReference({ albumKey, songIndex: null }, sources));
    }
    if (!sources.isCurrent?.()) return;
    const reference = (albumKey && albumArt.get(albumKey)) || await resolveArtworkReference(
      { albumKey: null, songIndex }, { ...sources, network: allowsNetwork() ? sources.network : null },
    );
    if (!reference || !sources.isCurrent?.()) return;
    publish(songIndex, reference);
    // Give a visible memory cover time to publish before another lookup can evict it.
    if (retry && typeof reference === 'function') {
      await new Promise<void>((resolve) => setTimeout(resolve, QUEUE_ARTWORK_FLUSH_MS));
    }
  }
}

export function applyQueueArtwork(
  queue: RemoteTrack[],
  artworkFor: (track: RemoteTrack) => ArtworkReference | undefined,
): RemoteTrack[] {
  let changed = false;
  const updated = queue.map((track) => {
    const artwork = artworkFor(track);
    if (!artwork || (track.artwork ?? track.artworkReference) === artwork) return track;
    changed = true;
    return typeof artwork === 'string'
      ? { ...track, artwork, artworkReference: undefined }
      : { ...track, artwork: null, artworkReference: artwork };
  });
  return changed ? updated : queue;
}
