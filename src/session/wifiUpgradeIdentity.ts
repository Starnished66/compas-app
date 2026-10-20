import { RemoteApi } from '../data/RemoteApi';

type CatalogProbe = Pick<RemoteApi, 'catalog'>;

export function publicLibraryIdentityMatches(expected: string | null | undefined, candidate: string | null | undefined): boolean {
  return Boolean(expected?.trim() && candidate?.trim() && expected === candidate);
}

/** A saved address is only a candidate; it may now belong to another player. */
export async function verifyWifiUpgradeIdentity(
  current: CatalogProbe,
  candidate: CatalogProbe,
  ownsSession: () => boolean,
): Promise<boolean> {
  if (!ownsSession()) return false;
  try {
    const [source, destination] = await Promise.all([
      current.catalog(0, 1),
      candidate.catalog(0, 1),
    ]);
    // Revisions change after a rescan; the persistent library ID identifies the player.
    return ownsSession() && source.libraryId.trim().length > 0 &&
      source.libraryId === destination.libraryId;
  } catch {
    return false;
  }
}
