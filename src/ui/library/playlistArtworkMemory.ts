import { LibraryEntry } from '../../data/types';

const artworkByPlaylist = new Map<string, string>();

export function rememberPlaylistArtwork(playlistKey: string, artwork: string): void {
  artworkByPlaylist.set(playlistKey, artwork);
}

export function withRememberedPlaylistArtwork(entries: LibraryEntry[]): LibraryEntry[] {
  if (!artworkByPlaylist.size) return entries;
  let changed = false;
  const result = entries.map((entry) => {
    const artwork = entry.playlistKey && !entry.artwork ? artworkByPlaylist.get(entry.playlistKey) : undefined;
    if (!artwork) return entry;
    changed = true;
    return { ...entry, artwork };
  });
  return changed ? result : entries;
}
