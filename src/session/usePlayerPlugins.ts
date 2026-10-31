import { useCallback, useEffect, useRef, useState } from 'react';
import { PluginsApi, PluginsApiError } from '../data/PluginsApi';
import { ActionResult, InstalledPlugin, InstalledSnapshot, LayoutSnapshot, PlayerLayout, StorePlugin, StoreSnapshot } from '../core/pluginModels';
import { useI18n } from '../i18n';
import { collectPluginPages } from './collectPluginPages';

const PAGE = 50;
const STORE_MAX = 600;
const INSTALLED_MAX = 400;
const LAYOUT_MAX = 1024;
const RUNNING = new Set(['refreshing', 'installing', 'updating', 'updating_all', 'uninstalling']);

export interface PlayerPluginsState {
  store: StoreSnapshot | null;
  installed: InstalledSnapshot | null;
  layouts: LayoutSnapshot | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  statusUnknown: boolean;
  storeBusy: boolean;
  refreshPending: boolean;
  statusCheck: () => Promise<void>;
  mutate: (request: () => Promise<ActionResult>) => Promise<void>;
}

/** Session-scoped, bounded pagination and serialized reads/writes for plugin management. */
export function usePlayerPlugins(api: PluginsApi | null, features: string[], active: boolean): PlayerPluginsState {
  const { t } = useI18n();
  const [store, setStore] = useState<StoreSnapshot | null>(null);
  const [installed, setInstalled] = useState<InstalledSnapshot | null>(null);
  const [layouts, setLayouts] = useState<LayoutSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusUnknown, setStatusUnknown] = useState(false);
  const statusUnknownRef = useRef(statusUnknown);
  statusUnknownRef.current = statusUnknown;
  const [refreshPending, setRefreshPending] = useState(false);
  const generation = useRef(0);
  const mounted = useRef(false);
  const inFlight = useRef(false);
  const actionBusy = useRef(false);
  const pendingStatusCheck = useRef(false);
  const pendingFullReload = useRef(false);
  const reloadRef = useRef<() => Promise<void>>(async () => {});
  const featureKey = features.filter((x) => ['plugin_store', 'plugin_management', 'player_layouts'].includes(x)).sort().join('|');

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current += 1; }; }, []);

  const schedulePendingStatusCheck = useCallback(() => {
    if (!pendingStatusCheck.current || inFlight.current || actionBusy.current || !mounted.current || !active) return;
    pendingStatusCheck.current = false;
    Promise.resolve().then(() => reloadRef.current());
  }, [active]);

  const loadAll = useCallback(async (token: number, clearStatus = true): Promise<boolean> => {
    if (!api || inFlight.current || !active) return false;
    inFlight.current = true;
    const currentApi = api;
    const valid = () => mounted.current && generation.current === token && active;
    try {
      if (featureKey.includes('plugin_store')) {
        const collection = await collectPluginPages((offset, limit) => currentApi.store(offset, limit), (page) => page.plugins, STORE_MAX, PAGE);
        if (!valid()) return false;
        setStore({ ...collection.first, plugins: collection.items });
      }

      if (featureKey.includes('plugin_management')) {
        const collection = await collectPluginPages((offset, limit) => currentApi.installed(offset, limit), (page) => page.plugins, INSTALLED_MAX, PAGE);
        if (!valid()) return false;
        setInstalled({ ...collection.first, truncated: collection.truncated || collection.first.truncated, plugins: collection.items });
        setRefreshPending(collection.first.refresh_pending);
      }

      if (featureKey.includes('player_layouts')) {
        const collection = await collectPluginPages((offset, limit) => currentApi.layouts(offset, limit), (page) => page.layouts, LAYOUT_MAX, PAGE);
        if (!valid()) return false;
        setLayouts({ ...collection.first, layouts: collection.items });
      }
      if (valid() && clearStatus) { setError(null); setStatusUnknown(false); }
      return valid();
    } catch (cause) {
      if (valid() && !statusUnknownRef.current) {
        setError(apiError(cause, t));
      }
      return false;
    } finally {
      inFlight.current = false;
      if (valid()) setLoading(false);
      else if (mounted.current && active && generation.current !== token) Promise.resolve().then(() => reloadRef.current());
      schedulePendingStatusCheck();
    }
  }, [active, api, featureKey, schedulePendingStatusCheck, t]);

  const statusCheck = useCallback(async () => {
    if (!api || !active) return;
    if (inFlight.current || actionBusy.current) { pendingStatusCheck.current = true; setLoading(true); return; }
    pendingFullReload.current = false;
    setLoading(true);
    await loadAll(generation.current, true);
  }, [active, api, loadAll]);
  reloadRef.current = statusCheck;

  useEffect(() => {
    generation.current += 1;
    const token = generation.current;
    setStore(null); setInstalled(null); setLayouts(null); setError(null); setStatusUnknown(false); setRefreshPending(false); setBusy(false); actionBusy.current = false;
    if (!api || !active) { setLoading(false); return; }
    setLoading(true);
    void loadAll(token);
    return () => { if (generation.current === token) generation.current += 1; };
  }, [active, api, featureKey, loadAll]);

  const storeBusy = !!store && RUNNING.has(store.state);
  const pollStatus = useCallback(async () => {
    if (!api || !active || inFlight.current || actionBusy.current) return;
    inFlight.current = true;
    const token = generation.current;
    const valid = () => mounted.current && generation.current === token && active;
    let fullReload = false;
    try {
      if (storeBusy) {
        const snapshot = await api.store(0, PAGE);
        if (!valid()) return;
        if (RUNNING.has(store?.state ?? '') && !RUNNING.has(snapshot.state)) fullReload = true;
        setStore((current) => ({ ...snapshot, plugins: current?.plugins ?? snapshot.plugins }));
      }
      if (refreshPending && featureKey.includes('plugin_management')) {
        const snapshot = await api.installed(0, PAGE);
        if (!valid()) return;
        if (refreshPending && !snapshot.refresh_pending) fullReload = true;
        setRefreshPending(snapshot.refresh_pending);
        setInstalled((current) => current ? { ...current, refresh_pending: snapshot.refresh_pending } : snapshot);
      }
    } catch {
      // Polling never replaces a visible operation error; the user can explicitly check status.
    } finally {
      inFlight.current = false;
      if (fullReload && valid()) pendingFullReload.current = true;
      if (pendingStatusCheck.current && valid()) schedulePendingStatusCheck();
      else if (pendingFullReload.current && valid() && !actionBusy.current) {
        pendingFullReload.current = false;
        setLoading(true);
        void loadAll(token, false);
      }
      if (!valid() && mounted.current && active && generation.current !== token) Promise.resolve().then(() => reloadRef.current());
    }
  }, [active, api, featureKey, loadAll, refreshPending, schedulePendingStatusCheck, store, storeBusy]);
  useEffect(() => {
    if (!active || !api || (!storeBusy && !refreshPending)) return;
    const interval = setInterval(() => void pollStatus(), 1400);
    return () => clearInterval(interval);
  }, [active, api, pollStatus, refreshPending, storeBusy]);

  const mutate = useCallback(async (request: () => Promise<ActionResult>) => {
    if (!api || !active || inFlight.current || actionBusy.current || storeBusy || refreshPending || statusUnknown) return;
    actionBusy.current = true;
    inFlight.current = true;
    setBusy(true); setError(null); setStatusUnknown(false);
    const token = generation.current;
    const valid = () => mounted.current && generation.current === token && active;
    let accepted = false;
    try {
      const result = await request();
      if (!result.accepted) throw new Error(t('The player did not accept the operation.'));
      accepted = true;
    } catch (cause) {
      if (valid()) { setError(cause instanceof Error && cause.message === t('The player did not accept the operation.') ? cause.message : apiError(cause, t)); setStatusUnknown(true); }
    } finally {
      inFlight.current = false;
      actionBusy.current = false;
      if (valid()) setBusy(false);
      else if (mounted.current && active && generation.current !== token) Promise.resolve().then(() => reloadRef.current());
      schedulePendingStatusCheck();
    }
    // The POST lock is released before the follow-up read begins. This prevents
    // an old mutation's finally block from unlocking a newer session's read.
    if (accepted && valid()) {
      setLoading(true);
      const refreshed = await loadAll(token, true);
      if (!refreshed && valid()) {
        setError(t('The request could not be completed. Check the player status before trying again.'));
        setStatusUnknown(true);
      }
    }
  }, [active, api, loadAll, refreshPending, schedulePendingStatusCheck, statusUnknown, storeBusy, t]);

  return { store, installed, layouts, loading, busy, error, statusUnknown, storeBusy, refreshPending, statusCheck, mutate };
}

function apiError(error: unknown, t: (key: string) => string): string {
  if (error instanceof PluginsApiError) {
    if ((error.status === 401 || error.status === 403) && /pin/.test(error.code)) return t('The saved PIN was rejected. Enter the current PIN.');
    if (error.status === 409) return t('The player is busy. Check its screen and try again.');
    return t('The request could not be completed. Check the player status before trying again.');
  }
  return t('Couldn’t load plugins');
}
