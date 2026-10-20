import { isSameWifiImportOwner } from '../wifiImportOwner';

describe('isSameWifiImportOwner', () => {
  it('keeps an import manager for the same player across a transport upgrade', () => {
    const ownerBeforeUpgrade = 'bt:player-1';
    const stableOwnerAfterUpgrade = 'bt:player-1';
    expect(isSameWifiImportOwner(ownerBeforeUpgrade, stableOwnerAfterUpgrade)).toBe(true);
  });

  it('ends the manager session on disconnect or when another player connects', () => {
    expect(isSameWifiImportOwner('player-1', null)).toBe(false);
    expect(isSameWifiImportOwner('player-1', 'player-2')).toBe(false);
    expect(isSameWifiImportOwner(null, 'player-2')).toBe(false);
  });
});
