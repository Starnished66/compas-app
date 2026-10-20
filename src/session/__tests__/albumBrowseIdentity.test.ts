import { exactAlbumBrowseKey } from '../albumBrowseIdentity';

const album = { name: 'Shared title', albumArtist: '', representativeId: 42 };

describe('empty album-artist browsing', () => {
  it('uses the cached album key without broadening to an album-title query', async () => {
    const lookup = jest.fn();
    await expect(exactAlbumBrowseKey(album, undefined, 'exact-key', true, lookup)).resolves.toBe('exact-key');
    expect(lookup).not.toHaveBeenCalled();
  });

  it('resolves ordered server rows through their representative song in the active catalog', async () => {
    const lookup = jest.fn(async () => 'untagged-album-key');
    await expect(exactAlbumBrowseKey(album, undefined, null, true, lookup)).resolves.toBe('untagged-album-key');
    expect(lookup).toHaveBeenCalledWith(42);
  });

  it('does not fall through to the ambiguous legacy endpoint without a synced catalog', async () => {
    const lookup = jest.fn();
    await expect(exactAlbumBrowseKey(album, undefined, 'exact-key', false, lookup)).rejects.toThrow('Sync the player library');
    expect(lookup).not.toHaveBeenCalled();
  });

  it('fails closed when the representative song is absent from the catalog', async () => {
    await expect(exactAlbumBrowseKey(album, undefined, null, true, async () => null)).rejects.toThrow('Sync the player library');
  });

  it('translates the sync-needed error at the UI boundary', async () => {
    await expect(exactAlbumBrowseKey(album, undefined, null, false, async () => null, (source) => `translated:${source}`))
      .rejects.toThrow('translated:Sync the player library before browsing this album.');
  });

  it('preserves artist-scoped and named album-artist filtering on older players', async () => {
    const lookup = jest.fn();
    await expect(exactAlbumBrowseKey(album, 'Artist', null, false, lookup)).resolves.toBeNull();
    await expect(exactAlbumBrowseKey({ ...album, albumArtist: 'Named artist' }, undefined, null, false, lookup)).resolves.toBeNull();
    expect(lookup).not.toHaveBeenCalled();
  });
});
