import { FolderEntry, LibraryEntry, LibraryGroup, PlayContext, Playlist, Song } from '../data/types';

export interface LibraryContext {
  kind: 'artist' | 'albumArtist';
  name: string;
  groupEntryId: string;
}

export type GroupKind = 'artist' | 'albumArtist' | 'genre';

export type EntryTarget =
  | { type: 'Song'; song: Song; context: PlayContext; catalogRevision?: string | null }
  | { type: 'Playlist'; playlist: Playlist }
  | { type: 'Group'; group: LibraryGroup; kind: GroupKind; orderedTrackCount?: { revision: string; count: number } }
  | { type: 'Album'; group: LibraryGroup; context: LibraryContext | null }
  | { type: 'Folder'; root: string; path: string; name: string }
  | { type: 'FolderTrack'; root: string; path: string; item: FolderEntry };

export interface LibraryEntrySources {
  coverUri(albumKey: string): string | undefined;
  activeRevision(): string | null;
}

const NETWORK_SOURCE = 'net';

class UniqueIds {
  private readonly used = new Set<string>();

  constructor(private readonly shown: ReadonlySet<string> = new Set()) {}

  next(parts: readonly unknown[]): string {
    const key = JSON.stringify(parts);
    let id = key;
    for (let copy = 2; this.shown.has(id) || this.used.has(id); copy++) id = `${key}#${copy}`;
    this.used.add(id);
    return id;
  }
}

export class LibraryEntryFactory {
  private readonly targets = new Map<string, EntryTarget>();
  // Paging passes the growing shown list each time; extend its id set instead of rebuilding it per page.
  private shownIds: { first: LibraryEntry; length: number; ids: Set<string> } | null = null;

  constructor(private readonly sources: LibraryEntrySources) {}

  private idsFor(after: readonly LibraryEntry[]): ReadonlySet<string> {
    if (!after.length) return new Set();
    const cached = this.shownIds;
    if (cached && after.length >= cached.length && after[0] === cached.first && cached.ids.has(after[cached.length - 1].id)) {
      for (let i = cached.length; i < after.length; i++) cached.ids.add(after[i].id);
      cached.length = after.length;
      return cached.ids;
    }
    const ids = new Set(after.map((entry) => entry.id));
    this.shownIds = { first: after[0], length: after.length, ids };
    return ids;
  }

  target(id: string): EntryTarget | undefined {
    return this.targets.get(id);
  }

  orderedGroupTrackCount({ groupEntryId }: LibraryContext) {
    const target = this.targets.get(groupEntryId);
    return target?.type === 'Group' ? target.orderedTrackCount : undefined;
  }

  saveOrderedGroupTrackCount({ groupEntryId, kind, name }: LibraryContext, revision: string, count: number): void {
    const target = this.targets.get(groupEntryId);
    if (target?.type === 'Group' && target.kind === kind && target.group.name === name) {
      target.orderedTrackCount = { revision, count };
    }
  }

  songs(
    songs: readonly Song[],
    context: PlayContext = {},
    catalogRevision?: string | null,
    after: readonly LibraryEntry[] = [],
  ): LibraryEntry[] {
    const revision = catalogRevision ?? this.sources.activeRevision();
    const ids = new UniqueIds(this.idsFor(after));
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

  albums(albums: readonly LibraryGroup[], context: LibraryContext | null, after: readonly LibraryEntry[] = []): LibraryEntry[] {
    const ids = new UniqueIds(this.idsFor(after));
    const source = this.source();
    return albums.map((album) => {
      const identity = album.albumKey ? [album.albumKey] : [album.name, album.albumArtist ?? ''];
      const id = ids.next(['album', source, context?.kind ?? '', context?.name ?? '', ...identity]);
      this.targets.set(id, { type: 'Album', group: album, context });
      return {
        id,
        title: album.name,
        subtitle: album.albumArtist || `${album.count} tracks`,
        subtitleTranslation: album.albumArtist ? undefined : { source: '{count} song', values: { count: album.count } },
        artwork: this.cover(album.albumKey),
        ...(album.stars != null ? { stars: album.stars } : {}),
      };
    });
  }

  groups(groups: readonly LibraryGroup[], kind: GroupKind): LibraryEntry[] {
    const ids = new UniqueIds();
    const source = this.source();
    return groups.map((group) => {
      const id = ids.next(['group', source, kind, group.name]);
      const previous = this.targets.get(id);
      const orderedTrackCount = previous?.type === 'Group' ? previous.orderedTrackCount : undefined;
      this.targets.set(id, { type: 'Group', group, kind, orderedTrackCount });
      return {
        id,
        title: group.name,
        subtitle: `${group.count} tracks`,
        subtitleTranslation: { source: '{count} song', values: { count: group.count } },
        artwork: this.cover(group.albumKey),
      };
    });
  }

  playlists(playlists: readonly Playlist[]): LibraryEntry[] {
    const ids = new UniqueIds();
    return playlists.map((playlist) => {
      const id = ids.next(['playlist', playlist.key]);
      this.targets.set(id, { type: 'Playlist', playlist });
      return {
        id,
        title: playlist.name,
        subtitle: 'Playlist',
        subtitleTranslation: { source: 'Playlist' },
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
    const ids = new UniqueIds(this.idsFor(after));
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
        subtitleTranslation: item.type === 'folder' ? { source: 'Folder' } : item.type === 'playlist' ? { source: 'Playlist file' } : item.artist ? undefined : { source: 'Track' },
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
