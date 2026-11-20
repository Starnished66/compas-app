interface Artwork {
  base64: string;
  mimeType: string;
  bytes: number;
}

const MAX_ENTRIES = 48;
// An 8 MiB player cover takes just over 21 MiB as a UTF-16 base64 string.
const MAX_BYTES = 24 * 1024 * 1024;

export class MemoryArtworkCache {
  private readonly entries = new Map<string, Artwork>();
  private bytes = 0;

  get(key: string): Artwork | undefined {
    const artwork = this.entries.get(key);
    if (artwork) {
      this.entries.delete(key);
      this.entries.set(key, artwork);
    }
    return artwork;
  }

  uri(key: string, mimeType?: string): string | null {
    const artwork = this.get(key);
    return artwork ? `data:${mimeType ?? artwork.mimeType};base64,${artwork.base64}` : null;
  }

  set(key: string, base64: string, mimeType: string): void {
    this.delete(key);
    // Count the encoded strings using two bytes per character.
    const bytes = (key.length + base64.length + mimeType.length) * 2;
    if (bytes > MAX_BYTES) return;
    while (this.bytes + bytes > MAX_BYTES || this.entries.size >= MAX_ENTRIES) {
      const oldest = this.entries.keys().next().value!;
      this.delete(oldest);
    }
    this.entries.set(key, { base64, mimeType, bytes });
    this.bytes += bytes;
  }

  delete(key: string): void {
    const artwork = this.entries.get(key);
    if (!artwork) return;
    this.bytes -= artwork.bytes;
    this.entries.delete(key);
  }

  keys(): IterableIterator<string> {
    return this.entries.keys();
  }
}

export type ArtworkReference = string | (() => string | null);

export function readArtwork(artwork?: ArtworkReference | null): string | null | undefined {
  return typeof artwork === 'function' ? artwork() : artwork;
}
