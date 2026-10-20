import { LibraryGroup } from '../../data/types';
import { RemoteApi } from '../../data/RemoteApi';
import { loadServerOrderedAlbumGroups } from '../librarySorting';
import { CategoryLoadContext, loadCategoryList } from '../libraryCategoryLoader';
import { LibraryCategory } from '../../data/types';

const group = (name: string, index: number): LibraryGroup => ({ name, index, count: 1, albumArtist: 'Artist' });

describe('loadServerOrderedAlbumGroups', () => {
  it('loads pages in the order returned by the player without sorting or reading catalog songs', async () => {
    const pages = [
      { total: 3, offset: 0, nextOffset: 2, revision: 'generation-1', groups: [group('Recently added', 1), group('Oldest', 2)] },
      { total: 3, offset: 2, nextOffset: 3, revision: 'generation-1', groups: [group('Middle', 3)] },
    ];
    const libraryAlbumGroups = jest.fn(async ({ offset }: { offset: number }) => pages[offset === 0 ? 0 : 1]);
    const api = { libraryAlbumGroups } as unknown as RemoteApi;

    await expect(loadServerOrderedAlbumGroups(api, 'albums')).resolves.toEqual([
      group('Recently added', 1), group('Oldest', 2), group('Middle', 3),
    ]);
    expect(libraryAlbumGroups).toHaveBeenNthCalledWith(1, { scope: 'albums', offset: 0, limit: 100 });
    expect(libraryAlbumGroups).toHaveBeenNthCalledWith(2, { scope: 'albums', offset: 2, limit: 100 });
  });

  it('rejects a page that cannot advance', async () => {
    const api = { libraryAlbumGroups: async () => ({ total: 2, offset: 0, nextOffset: 0, revision: 'generation-1', groups: [] }) } as unknown as RemoteApi;
    await expect(loadServerOrderedAlbumGroups(api, 'artists')).rejects.toThrow('Invalid ordered album group page');
  });

  it('rejects pages from a different sort generation', async () => {
    const pages = [
      { total: 3, offset: 0, nextOffset: 2, revision: 'generation-1', groups: [group('First', 1), group('Second', 2)] },
      { total: 3, offset: 2, nextOffset: 3, revision: 'generation-2', groups: [group('Third', 3)] },
    ];
    const api = { libraryAlbumGroups: jest.fn(async ({ offset }: { offset: number }) => pages[offset === 0 ? 0 : 1]) } as unknown as RemoteApi;
    await expect(loadServerOrderedAlbumGroups(api, 'artists')).rejects.toThrow('Invalid ordered album group page');
  });
});

describe('album category sorting', () => {
  const sorting = (effective: 0 | 1 | 2) => ({
    albums: { configured: 2, effective, available: [true, true, true] as const },
    artists: { configured: 0, effective: 0, available: [true, true, true] as const },
    albumArtists: { configured: 0, effective: 0, available: [true, true, true] as const },
  });

  function context(effective: 0 | 1 | 2) {
    const catalogGroup = (name: string, index: number) => ({ name, count: 1, index, albumArtist: 'Artist', albumKey: `key-${index}` });
    const api = { libraryAlbumGroups: jest.fn(async () => ({
      total: 1,
      offset: 0,
      nextOffset: 1,
      revision: 'sort-generation-1',
      groups: [group('Server order', 1)],
    })) };
    const store = { groups: jest.fn(async () => [catalogGroup('Zulu', 2), catalogGroup('Alpha', 1)]) };
    const entries = { albums: jest.fn((groups: LibraryGroup[]) => groups.map((item) => ({ id: item.name, title: item.name, subtitle: '', kind: 'other' }))) };
    return {
      api,
      store,
      entries,
      loadContext: {
        api,
        catalog: { libraryId: 'library', revision: 'catalog-revision' },
        store,
        entries,
        features: new Set(['library_sorting']),
        librarySorting: sorting(effective),
      } as unknown as CategoryLoadContext,
    };
  }

  it('keeps name mode on the cached local catalog path', async () => {
    const { api, store, entries, loadContext } = context(0);
    const result = await loadCategoryList(LibraryCategory.Albums, null, loadContext);
    expect(api.libraryAlbumGroups).not.toHaveBeenCalled();
    expect(store.groups).toHaveBeenCalledTimes(1);
    expect(entries.albums).toHaveBeenCalledWith([expect.objectContaining({ name: 'Alpha' }), expect.objectContaining({ name: 'Zulu' })], null);
    expect(result.entries.map((entry) => entry.title)).toEqual(['Alpha', 'Zulu']);
  });

  it('uses the server ordered groups for a non-name effective mode', async () => {
    const { api, store, entries, loadContext } = context(1);
    const result = await loadCategoryList(LibraryCategory.Albums, null, loadContext);
    expect(api.libraryAlbumGroups).toHaveBeenCalledTimes(1);
    expect(store.groups).not.toHaveBeenCalled();
    expect(entries.albums).toHaveBeenCalledWith([group('Server order', 1)], null);
    expect(result.entries.map((entry) => entry.title)).toEqual(['Server order']);
  });

  it('uses cached name order when a configured sort falls back to effective name mode', async () => {
    const { api, store, loadContext } = context(0);
    await loadCategoryList(LibraryCategory.Albums, null, loadContext);
    expect(api.libraryAlbumGroups).not.toHaveBeenCalled();
    expect(store.groups).toHaveBeenCalledTimes(1);
  });
});
