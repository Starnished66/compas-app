import type { SessionState } from './useSessionRefs';
import { sameCatalogRevision } from './librarySnapshot';
import { CatalogIdentity } from '../data/SyncedCatalogStore';
import { LocalCatalogReadError } from '../data/catalogDatabase';

interface CatalogAdoptionDependencies {
  shared: Pick<SessionState,
    'activeCatalogRef' | 'catalogSyncGenerationRef' | 'catalogSyncProgress' | 'libraryListCacheRef' | 'searchReads'
  >;
  clearArtworkState: () => void;
}

export function createCatalogAdoption({ shared, clearArtworkState }: CatalogAdoptionDependencies) {
  const {
    activeCatalogRef,
    catalogSyncGenerationRef,
    catalogSyncProgress,
    libraryListCacheRef,
    searchReads,
  } = shared;

  const adoptCatalog = (identity: CatalogIdentity | null) => {
    const previous = activeCatalogRef.current;
    activeCatalogRef.current = identity;
    if (!sameCatalogRevision(previous, identity)) {
      searchReads.invalidateGroups();
      libraryListCacheRef.current.clear();
      clearArtworkState();
    }
  };

  const markCatalogUnavailable = () => {
    ++catalogSyncGenerationRef.current;
    adoptCatalog(null);
    catalogSyncProgress.set('Local catalog unavailable');
  };

  const recoverCatalogBrowse = (error: unknown, catalog: CatalogIdentity | null) => {
    if (!(error instanceof LocalCatalogReadError) || !catalog || !sameCatalogRevision(catalog, activeCatalogRef.current)) return false;
    markCatalogUnavailable();
    return true;
  };

  return { adoptCatalog, markCatalogUnavailable, recoverCatalogBrowse };
}
