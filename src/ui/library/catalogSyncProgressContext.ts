import { createContext, useContext, useSyncExternalStore } from 'react';
import { CatalogSyncProgressStore } from '../../session/CatalogSyncProgressStore';

export const CatalogSyncProgressContext = createContext(new CatalogSyncProgressStore());

export function useCatalogSyncProgress(): string | null {
  const store = useContext(CatalogSyncProgressContext);
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
