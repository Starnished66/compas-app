import { LibraryGroup, Song } from '../../data/types';
import { LibraryEntryFactory } from '../LibraryEntryFactory';

const song = (index: number, extra: Partial<Song> = {}): Song => ({ index, title: `Song ${index}`, artist: 'Artist', album: 'Album', ...extra });
const album = (name: string, albumKey: string | null): LibraryGroup => ({ name, count: 3, index: 1, albumArtist: 'Artist', albumKey });

function factoryAt(revision: string | null) {
  const sources = { revision, coverUri: (key: string) => (key === 'k1' ? 'file://k1' : undefined) };
  const factory = new LibraryEntryFactory({
    coverUri: (key) => sources.coverUri(key),
    activeRevision: () => sources.revision,
  });
  return { factory, sources };
}

describe('LibraryEntryFactory', () => {
  it('gives the same entry the same id on every load', () => {
    const { factory } = factoryAt('rev1');
    const first = factory.albums([album('One', 'k1'), album('Two', 'k2')], null);
    const second = factory.albums([album('Two', 'k2'), album('One', 'k1')], null);
    expect(second.map((entry) => entry.id)).toEqual([first[1].id, first[0].id]);
    expect(first[0].artwork).toBe('file://k1');
    expect(factory.target(first[0].id)).toEqual({ type: 'Album', group: album('One', 'k1'), context: null });
  });

  it('separates entries whose targets differ', () => {
    const { factory, sources } = factoryAt('rev1');
    const root = factory.albums([album('One', 'k1')], null)[0].id;
    const nested = factory.albums([album('One', 'k1')], { kind: 'artist', name: 'Artist' })[0].id;
    const inPlaylist = factory.songs([song(4)], { playlist: 'Mix' })[0].id;
    const inLibrary = factory.songs([song(4)])[0].id;
    sources.revision = 'rev2';
    const afterResync = factory.albums([album('One', 'k1')], null)[0].id;
    expect(new Set([root, nested, afterResync]).size).toBe(3);
    expect(inPlaylist).not.toBe(inLibrary);
  });

  it('keeps ids unique for repeated songs, including across appended pages', () => {
    const { factory } = factoryAt(null);
    const page = factory.songs([song(7), song(7)], { playlist: '@recently_played' });
    const next = factory.songs([song(7)], { playlist: '@recently_played' }, undefined, page);
    const ids = [...page, ...next].map((entry) => entry.id);
    expect(new Set(ids).size).toBe(3);
    expect(factory.target(ids[2])).toMatchObject({ type: 'Song', song: song(7) });
  });

  it('keeps a playlist track id when the track moves', () => {
    const { factory } = factoryAt('rev1');
    const before = factory.songs([song(3, { position: 0 }), song(8, { position: 1 })], { playlist: 'Mix' });
    const after = factory.songs([song(8, { position: 0 }), song(3, { position: 1 })], { playlist: 'Mix' });
    expect(after.map((entry) => entry.id)).toEqual([before[1].id, before[0].id]);
    expect(factory.target(before[0].id)).toMatchObject({ song: { index: 3, position: 1 } });
  });

  it('forgets targets on clear', () => {
    const { factory } = factoryAt('rev1');
    const [entry] = factory.playlists([{ key: 'Mix', name: 'Mix', internal: false, writable: true }]);
    factory.clear();
    expect(factory.target(entry.id)).toBeUndefined();
  });
});
