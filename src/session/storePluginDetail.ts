import type { StorePlugin } from '../core/pluginModels';

export type StoreDetailPrimaryAction = 'review-install' | 'review-update' | 'install' | 'update' | null;

/** Resolve an open detail view from the latest catalog response by catalog ID. */
export function resolveCurrentStorePlugin(catalog: StorePlugin[], selectedId: string | null): StorePlugin | null {
  return selectedId ? catalog.find((plugin) => plugin.id === selectedId) ?? null : null;
}

/** Derive detail actions from current server state so a refreshed row updates an open screen. */
export function getStoreDetailActions(plugin: StorePlugin): { primary: StoreDetailPrimaryAction; canUninstall: boolean } {
  const primary: StoreDetailPrimaryAction = plugin.needs_confirmation
    ? plugin.state === 'update' ? 'review-update' : 'review-install'
    : ['available', 'manual'].includes(plugin.state) ? 'install'
      : plugin.state === 'update' ? 'update' : null;
  return { primary, canUninstall: ['installed', 'update', 'removed'].includes(plugin.state) };
}
