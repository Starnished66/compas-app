import { useCallback, useEffect, useRef, useState } from 'react';
import { WifiImportFileEntry } from '../../data/types';
import { useI18n } from '../../i18n';
import { sdBrowserError } from './sdBrowserError';
import type { TransferApi } from '../screens/TransferScreen';

type Edit = { kind: 'mkdir' } | { kind: 'rename'; entry: WifiImportFileEntry };
// `failed` is the listing request to repeat; a failed rename or delete has none.
type Listing = { entries: WifiImportFileEntry[]; nextOffset: number | null; loaded: boolean; loading: boolean; error?: unknown; failed?: { offset: number; append: boolean } };
const emptyListing: Listing = { entries: [], nextOffset: null, loaded: false, loading: false };

export function useSdBrowser(api: TransferApi, initialPath = '', onFailure?: (cause: unknown) => void, seed?: Pick<Listing, 'entries' | 'nextOffset'>) {
  const { t } = useI18n();
  const [path, setPath] = useState(initialPath);
  const [listing, setListing] = useState<Listing>(() => ({ ...emptyListing, entries: seed?.entries ?? [], nextOffset: seed?.nextOffset ?? null }));
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Edit | null>(null);
  const [editValue, setEditValue] = useState('');
  const generation = useRef(0);
  const current = useRef({ path, listing });
  const refs = useRef({ api, onFailure });
  refs.current = { api, onFailure };
  const publish = (nextPath: string, next: Listing) => {
    current.current = { path: nextPath, listing: next };
    setPath(nextPath);
    setListing(next);
  };
  useEffect(() => () => { generation.current++; }, []);

  const load = useCallback(async (nextPath: string, append = false, retryOffset?: number) => {
    const previous = current.current;
    append = append && nextPath === previous.path;
    const offset = append ? retryOffset ?? previous.listing.nextOffset : 0;
    if (offset === null) return;
    const request = ++generation.current;
    setSaving(false);
    const base = nextPath === previous.path ? previous.listing : emptyListing;
    publish(nextPath, { ...base, loaded: false, loading: true, error: undefined, failed: undefined });
    try {
      const page = await refs.current.api.list(nextPath, offset);
      if (request !== generation.current) return;
      publish(nextPath, { entries: append ? [...base.entries, ...page.entries] : page.entries, nextOffset: page.nextOffset, loaded: true, loading: false });
    } catch (cause) {
      if (request !== generation.current) return;
      publish(nextPath, { ...base, loaded: false, loading: false, error: cause, failed: { offset, append } });
      refs.current.onFailure?.(cause);
    }
  }, []);
  const retry = async () => {
    const { path: folder, listing: { failed } } = current.current;
    if (failed) await load(folder, failed.append, failed.offset);
  };
  const reset = useCallback(() => {
    generation.current++;
    publish(current.current.path, emptyListing);
    setSaving(false);
    setEditing(null);
  }, []);
  const mutate = async (action: () => Promise<void>) => {
    const request = ++generation.current;
    const folder = current.current.path;
    setSaving(true);
    publish(folder, { ...current.current.listing, error: undefined, failed: undefined });
    try {
      await action();
      if (request !== generation.current) return;
      setEditing(null);
      setEditValue('');
      await load(folder);
    } catch (cause) {
      if (request !== generation.current) return;
      publish(folder, { ...current.current.listing, error: cause, failed: undefined });
      refs.current.onFailure?.(cause);
    } finally {
      if (request === generation.current) setSaving(false);
    }
  };
  const saveEdit = async () => {
    const name = editValue.trim();
    if (!editing || !name || saving || listing.loading) return;
    await mutate(() => editing.kind === 'mkdir' ? refs.current.api.mkdir(path, name) : refs.current.api.rename(editing.entry.path, name));
  };
  return { ...listing, path, loading: saving || listing.loading, error: listing.error ? sdBrowserError(listing.error, t) : null, canRetry: !!listing.failed,
    editing, editValue, setEditing, setEditValue, load, retry, reset, saveEdit, mutate };
}
export type SdBrowser = ReturnType<typeof useSdBrowser>;
