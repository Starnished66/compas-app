import { CatalogPage } from '../../data/types';
import { publicLibraryIdentityMatches, verifyWifiUpgradeIdentity } from '../wifiUpgradeIdentity';

function probe(libraryId: string, revision = 'revision-1') {
  return { catalog: jest.fn(async (): Promise<CatalogPage> => ({
    libraryId, revision, total: 0, offset: 0, nextOffset: 0, songs: [],
  })) };
}

describe('automatic Wi-Fi upgrade identity', () => {
  it('rejects a saved Wi-Fi endpoint belonging to a different player', async () => {
    const bluetooth = probe('r1-library');
    const savedWifi = probe('simulator-library');
    await expect(verifyWifiUpgradeIdentity(bluetooth, savedWifi, () => true)).resolves.toBe(false);
    expect(bluetooth.catalog).toHaveBeenCalledWith(0, 1);
    expect(savedWifi.catalog).toHaveBeenCalledWith(0, 1);
  });

  it('accepts the same player even if its library revision changes', async () => {
    await expect(verifyWifiUpgradeIdentity(probe('r1-library', 'before'), probe('r1-library', 'after'), () => true)).resolves.toBe(true);
  });

  it.each(['', '   '])('rejects an unverifiable matching identity %j', async (identity) => {
    await expect(verifyWifiUpgradeIdentity(probe(identity), probe(identity), () => true)).resolves.toBe(false);
  });

  it('stays on Bluetooth when a catalog probe fails', async () => {
    const wifi = probe('r1-library');
    wifi.catalog.mockRejectedValueOnce(new Error('Catalog unavailable'));
    await expect(verifyWifiUpgradeIdentity(probe('r1-library'), wifi, () => true)).resolves.toBe(false);
  });

  it('discards matching responses after another connection attempt starts', async () => {
    let owned = true;
    let finish!: (page: CatalogPage) => void;
    const bluetooth = probe('r1-library');
    const wifi = { catalog: jest.fn(() => new Promise<CatalogPage>((resolve) => { finish = resolve; })) };
    const pending = verifyWifiUpgradeIdentity(bluetooth, wifi, () => owned);
    owned = false;
    finish(await bluetooth.catalog());
    await expect(pending).resolves.toBe(false);
  });

  it('does not start probes after losing session ownership', async () => {
    const bluetooth = probe('r1-library');
    const wifi = probe('r1-library');
    await expect(verifyWifiUpgradeIdentity(bluetooth, wifi, () => false)).resolves.toBe(false);
    expect(bluetooth.catalog).not.toHaveBeenCalled();
    expect(wifi.catalog).not.toHaveBeenCalled();
  });
});

describe('public Wi-Fi upgrade prefilter', () => {
  it('requires exact, non-empty public library IDs before a candidate gets credentials', async () => {
    expect(publicLibraryIdentityMatches('library-1', 'library-1')).toBe(true);
    expect(publicLibraryIdentityMatches('library-1', 'other-library')).toBe(false);
    expect(publicLibraryIdentityMatches('library-1', null)).toBe(false);
    expect(publicLibraryIdentityMatches('', 'library-1')).toBe(false);
  });
});
