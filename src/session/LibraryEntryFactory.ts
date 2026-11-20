import { FolderEntry, LibraryEntry, LibraryGroup, PlayContext, Playlist, Song } from '../data/types';

export interface LibraryContext {
  kind: 'artist' | 'albumArtist';
  name: string;
}

export type GroupKind = 'artist' | 'albumArtist' | 'genre';

export type EntryTarget =
  | { type: 'Song'; song: Song; context: PlayContext; catalogRevision?: string | null; sourceRevision: string | null }
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

export interface NetworkSongSource { sourceRevision: string | null }

class UniqueIds {
  private readonly used = new Set<string>();

  constructor(private readonly shown: Pick<ReadonlyMap<string, number>, 'has'> = new Map()) {}

  next(parts: readonly unknown[]): string {
    const key = JSON.stringify(parts);
    let id = key;
    for (let copy = 2; this.shown.has(id) || this.used.has(id); copy++) id = `${key}#${copy}`;
    this.used.add(id);
    return id;
  }
}

export class LibraryEntryFactory {
  private readonly sourceToken = {};

  constructor(
    private readonly sources: LibraryEntrySources,
    private readonly bindings = {
      targets: new WeakMap<LibraryEntry, { target: EntryTarget; source: object }>(),
      rowsById: new WeakMap<readonly LibraryEntry[], Map<string, number>>(),
      orderedTrackCounts: new Map<string, { revision: string; count: number }>(),
    },
  ) {}

  nextSource(): LibraryEntryFactory {
    return new LibraryEntryFactory(this.sources, this.bindings);
  }

  private idsFor(entries: readonly LibraryEntry[]): Map<string, number> {
    let ids = this.bindings.rowsById.get(entries);
    if (!ids) {
      ids = new Map(entries.map((entry, index) => [entry.id, index]));
      this.bindings.rowsById.set(entries, ids);
    }
    return ids;
  }

  append(shown: readonly LibraryEntry[], added: LibraryEntry[]): LibraryEntry[] {
    if (!shown.length) return added;
    if (!added.length) return [...shown];
    const previous = this.idsFor(shown);
    // Snapshots share the index but only see their own prefix. A fork gets its own index.
    const ids = previous.size === shown.length ? previous : new Map(shown.map((entry, index) => [entry.id, index]));
    added.forEach((entry, index) => ids.set(entry.id, shown.length + index));
    const entries = [...shown, ...added];
    this.bindings.rowsById.set(entries, ids);
    return entries;
  }

  private appendedIds(entries: readonly LibraryEntry[]): UniqueIds {
    const ids = this.idsFor(entries);
    return new UniqueIds({ has: (id) => (ids.get(id) ?? entries.length) < entries.length });
  }

  row(id: string, entries: readonly LibraryEntry[]): LibraryEntry | undefined {
    const index = this.idsFor(entries).get(id);
    return index === undefined ? undefined : entries[index];
  }

  target(entry: LibraryEntry | undefined): EntryTarget | undefined {
    return entry && this.bindings.targets.get(entry)?.target;
  }

  currentTarget(entry: LibraryEntry | undefined): EntryTarget | undefined {
    const binding = entry && this.bindings.targets.get(entry);
    return binding?.source === this.sourceToken ? binding.target : undefined;
  }

  private bind(entry: LibraryEntry, target: EntryTarget): LibraryEntry {
    this.bindings.targets.set(entry, { target, source: this.sourceToken });
    return entry;
  }

  copyTarget(from: LibraryEntry, to: LibraryEntry): LibraryEntry {
    const binding = this.bindings.targets.get(from);
    if (binding) this.bindings.targets.set(to, binding);
    return to;
  }

  orderedGroupTrackCount({ kind, name }: LibraryContext, revision: string): number | undefined {
    const saved = this.bindings.orderedTrackCounts.get(JSON.stringify([kind, name]));
    return saved?.revision === revision ? saved.count : undefined;
  }

  saveOrderedGroupTrackCount({ kind, name }: LibraryContext, revision: string, count: number): void {
    this.bindings.orderedTrackCounts.set(JSON.stringify([kind, name]), { revision, count });
  }

  songs(
    songs: readonly Song[],
    context: PlayContext = {},
    source?: string | null | NetworkSongSource,
    after: readonly LibraryEntry[] = [],
  ): LibraryEntry[] {
    const network = source != null && typeof source === 'object' ? source : null;
    const revision = (typeof source === 'string' ? source : null) ?? this.sources.activeRevision();
    const sourceRevision = network ? network.sourceRevision : revision;
    const ids = this.appendedIds(after);
    const scope = [context.playlist ?? '', context.artist ?? '', context.albumArtist ?? '', context.album ?? ''];
    return songs.map((song) => {
      const id = ids.next(['song', revision ?? NETWORK_SOURCE, ...scope, song.index]);
      return this.bind({
        id,
        title: song.title,
        subtitle: song.artist || '',
        artwork: this.cover(song.albumKey),
        kind: 'song',
        playlistPosition: song.position,
      }, { type: 'Song', song, context, catalogRevision: revision, sourceRevision });
    });
  }

  albums(albums: readonly LibraryGroup[], context: LibraryContext | null, after: readonly LibraryEntry[] = []): LibraryEntry[] {
    const ids = this.appendedIds(after);
    const source = this.source();
    return albums.map((album) => {
      const identity = album.albumKey ? [album.albumKey] : [album.name, album.albumArtist ?? ''];
      const id = ids.next(['album', source, context?.kind ?? '', context?.name ?? '', ...identity]);
      return this.bind({
        id,
        title: album.name,
        subtitle: album.albumArtist || `${album.count} tracks`,
        subtitleTranslation: album.albumArtist ? undefined : { source: '{count} song', values: { count: album.count } },
        artwork: this.cover(album.albumKey),
        ...(album.stars != null ? { stars: album.stars } : {}),
      }, { type: 'Album', group: album, context });
    });
  }

  groups(groups: readonly LibraryGroup[], kind: GroupKind): LibraryEntry[] {
    const ids = new UniqueIds();
    const source = this.source();
    return groups.map((group) => {
      const id = ids.next(['group', source, kind, group.name]);
      return this.bind({
        id,
        title: group.name,
        subtitle: `${group.count} tracks`,
        subtitleTranslation: { source: '{count} song', values: { count: group.count } },
        artwork: this.cover(group.albumKey),
      }, { type: 'Group', group, kind });
    });
  }

  playlists(playlists: readonly Playlist[]): LibraryEntry[] {
    const ids = new UniqueIds();
    return playlists.map((playlist) => {
      const id = ids.next(['playlist', playlist.key]);
      return this.bind({
        id,
        title: playlist.name,
        subtitle: 'Playlist',
        subtitleTranslation: { source: 'Playlist' },
        kind: 'other',
        playlistKey: playlist.key,
        writable: playlist.writable,
      }, { type: 'Playlist', playlist });
    });
  }

  folderItems(
    items: readonly FolderEntry[],
    root: string,
    parent: string,
    after: readonly LibraryEntry[] = [],
  ): LibraryEntry[] {
    const ids = this.appendedIds(after);
    return items.map((item) => {
      const path = parent ? `${parent}/${item.name}` : item.name;
      const id = ids.next(['folder', root, path, item.type]);
      return this.bind({
        id,
        title: item.title || item.name,
        subtitle: item.type === 'folder' ? 'Folder' : item.type === 'playlist' ? 'Playlist file' : item.artist || 'Track',
        subtitleTranslation: item.type === 'folder' ? { source: 'Folder' } : item.type === 'playlist' ? { source: 'Playlist file' } : item.artist ? undefined : { source: 'Track' },
        kind: 'other',
      }, item.type === 'folder' ? { type: 'Folder', root, path, name: item.name } : { type: 'FolderTrack', root, path, item });
    });
  }

  clear(): void {
    this.bindings.targets = new WeakMap();
    this.bindings.rowsById = new WeakMap();
    this.bindings.orderedTrackCounts.clear();
  }

  private source(): string {
    return this.sources.activeRevision() ?? NETWORK_SOURCE;
  }

  private cover(albumKey: string | null | undefined): string | undefined {
    return albumKey ? this.sources.coverUri(albumKey) : undefined;
  }
}
