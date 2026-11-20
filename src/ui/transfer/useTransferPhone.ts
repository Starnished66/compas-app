import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { getStorageRoots, listLocalDirectory, type LocalFileEntry, type StorageRoot } from '../../../modules/compas-files/src';
import { selectionTotals } from '../../session/transferPlan';
import type { useI18n } from '../../i18n';

type Translate = ReturnType<typeof useI18n>['t'];

export function useTransferPhoneState() {
  const [roots, setRoots] = useState<StorageRoot[]>([]);
  const [root, setRoot] = useState<StorageRoot | null>(null);
  const [phonePath, setPhonePath] = useState<string | null>(null);
  const [phoneShowHidden, setPhoneShowHidden] = useState(false);
  const phoneHiddenRef = useRef(false);
  const [phoneEntries, setPhoneEntries] = useState<LocalFileEntry[]>([]);
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [selected, setSelected] = useState<Map<string, LocalFileEntry>>(() => new Map());
  const phoneGenerationRef = useRef(0);

  return {
    roots, setRoots, root, setRoot, phonePath, setPhonePath, phoneShowHidden, setPhoneShowHidden, phoneHiddenRef,
    phoneEntries, setPhoneEntries, phoneLoading, setPhoneLoading, selected, setSelected, phoneGenerationRef,
  };
}

export function useTransferPhoneLoading(
  state: ReturnType<typeof useTransferPhoneState>, aliveRef: RefObject<boolean>, setError: (message: string | null) => void, t: Translate,
) {
  const { phoneGenerationRef, setPhoneLoading, phoneHiddenRef, setPhonePath, setPhoneEntries, setRoots, setRoot } = state;
  const openPhoneDirectory = useCallback(async (path: string) => {
    const generation = ++phoneGenerationRef.current;
    setPhoneLoading(true);
    setError(null);
    try {
      const entries = await listLocalDirectory(path, phoneHiddenRef.current);
      if (!aliveRef.current || generation !== phoneGenerationRef.current) return;
      setPhonePath(path);
      setPhoneEntries(entries);
    } catch (cause: any) {
      if (aliveRef.current && generation === phoneGenerationRef.current) setError(cause?.message || t('Could not read this folder.'));
    } finally {
      if (aliveRef.current && generation === phoneGenerationRef.current) setPhoneLoading(false);
    }
  }, [t]);

  useEffect(() => {
    try {
      const available = getStorageRoots();
      setRoots(available);
      const initial = available[0] ?? null;
      setRoot(initial);
      if (initial) void openPhoneDirectory(initial.path);
    } catch (cause: any) {
      setError(cause?.message || t('Could not read this folder.'));
    }
  }, [openPhoneDirectory, t]);

  return openPhoneDirectory;
}

export function useTransferPhoneSelection({ selected, setSelected }: ReturnType<typeof useTransferPhoneState>) {
  const toggleSelected = (entry: LocalFileEntry) => {
    setSelected((previous) => {
      const next = new Map(previous);
      if (next.has(entry.path)) next.delete(entry.path);
      else next.set(entry.path, entry);
      return next;
    });
  };

  const { bytes: selectedFileBytes, folders: selectedFolders, count: selectedCount } = useMemo(
    () => selectionTotals([...selected.values()]), [selected]);

  return { toggleSelected, selectedFileBytes, selectedFolders, selectedCount };
}
