import { FolderEntry, LibraryEntry, LibraryGroup, PlayContext, Playlist, Song } from '../data/types';

export interface LibraryContext {
  kind: 'artist' | 'albumArtist';
  name: string;
}

export type GroupKind = 'artist' | 'albumArtist' | 'genre';

export type EntryTarget =
  | { type: 'Song'; song: Song; context: PlayContext; catalogRevision?: string | null }
  | { type: 'Playlist'; playlist: Playlist }
  | { type: 'Group'; group: LibraryGroup; kind: GroupKind }
  | { type: 'Album'; group: LibraryGroup; context: LibraryContext | null }
  | { type: 'Folder'; root: string; path: string; name: string }
  | { type: 'FolderTrack'; root: string; path: string; item: FolderEntry };

export interface LibraryEntrySources {
  coverUri(albumKey: string): string | undefined;
  activeRevision(): string | null;
}

const NETWORK_SOURCE = 'net';

class UniqueIds {
  private readonly used: Set<string>;

  constructor(existing: readonly LibraryEntry[]) {
    this.used = new Set(existing.map((entry) => entry.id));
  }

  next(parts: readonly unknown[]): string {
    const key = JSON.stringify(parts);
    let id = key;
    for (let copy = 2; this.used.has(id); copy++) id = `${key}#${copy}`;
    this.used.add(id);
    return id;
  }
}

export class LibraryEntryFactory {
  private readonly targets = new Map<string, EntryTarget>();

  constructor(private readonly sources: LibraryEntrySources) {}

  target(id: string): EntryTarget | undefined {
    return this.targets.get(id);
  }

  songs(
    songs: readonly Song[],
    context: PlayContext = {},
    catalogRevision?: string | null,
    after: readonly LibraryEntry[] = [],
  ): LibraryEntry[] {
    const revision = catalogRevision ?? this.sources.activeRevision();
    const ids = new UniqueIds(after);
    const scope = [context.playlist ?? '', context.artist ?? '', context.albumArtist ?? '', context.album ?? ''];
    return songs.map((song) => {
      const id = ids.next(['song', revision ?? NETWORK_SOURCE, ...scope, song.index]);
      this.targets.set(id, { type: 'Song', song, context, catalogRevision: revision });
      return {
        id,
        title: song.title,
        subtitle: song.artist || '',
        artwork: this.cover(song.albumKey),
        kind: 'song',
        playlistPosition: song.position,
      };
    });
  }

  albums(albums: readonly LibraryGroup[], context: LibraryContext | null): LibraryEntry[] {
    const ids = new UniqueIds([]);
    const source = this.source();
    return albums.map((album) => {
      const identity = album.albumKey ? [album.albumKey] : [album.name, album.albumArtist ?? ''];
      const id = ids.next(['album', source, context?.kind ?? '', context?.name ?? '', ...identity]);
      this.targets.set(id, { type: 'Album', group: album, context });
      return {
        id,
        title: album.name,
        subtitle: album.albumArtist || `${album.count} tracks`,
        artwork: this.cover(album.albumKey),
      };
    });
  }

  groups(groups: readonly LibraryGroup[], kind: GroupKind): LibraryEntry[] {
    const ids = new UniqueIds([]);
    const source = this.source();
    return groups.map((group) => {
      const id = ids.next(['group', source, kind, group.name]);
      this.targets.set(id, { type: 'Group', group, kind });
      return {
        id,
        title: group.name,
        subtitle: `${group.count} tracks`,
        artwork: this.cover(group.albumKey),
      };
    });
  }

  playlists(playlists: readonly Playlist[]): LibraryEntry[] {
    const ids = new UniqueIds([]);
    return playlists.map((playlist) => {
      const id = ids.next(['playlist', playlist.key]);
      this.targets.set(id, { type: 'Playlist', playlist });
      return {
        id,
        title: playlist.name,
        subtitle: 'Playlist',
        kind: 'other',
        playlistKey: playlist.key,
        writable: playlist.writable,
      };
    });
  }

  folderItems(
    items: readonly FolderEntry[],
    root: string,
    parent: string,
    after: readonly LibraryEntry[] = [],
  ): LibraryEntry[] {
    const ids = new UniqueIds(after);
    return items.map((item) => {
      const path = parent ? `${parent}/${item.name}` : item.name;
      const id = ids.next(['folder', root, path, item.type]);
      this.targets.set(
        id,
        item.type === 'folder' ? { type: 'Folder', root, path, name: item.name } : { type: 'FolderTrack', root, path, item },
      );
      return {
        id,
        title: item.title || item.name,
        subtitle: item.type === 'folder' ? 'Folder' : item.type === 'playlist' ? 'Playlist file' : item.artist || 'Track',
        kind: 'other',
      };
    });
  }

  clear(): void {
    this.targets.clear();
  }

  private source(): string {
    return this.sources.activeRevision() ?? NETWORK_SOURCE;
  }

  private cover(albumKey: string | null | undefined): string | undefined {
    return albumKey ? this.sources.coverUri(albumKey) : undefined;
  }
}
