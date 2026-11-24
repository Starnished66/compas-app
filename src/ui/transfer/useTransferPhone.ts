import { useCallback, useMemo, useRef, useState } from 'react';
import type { LocalFileEntry } from '../../../modules/compas-files/src';
import { selectionTotals } from '../../session/transferPlan';
import type { useI18n } from '../../i18n';
import { useLocalDirectoryBrowser } from './useLocalDirectoryBrowser';

type Translate = ReturnType<typeof useI18n>['t'];

export function useTransferPhoneBrowser(setError: (message: string | null) => void, t: Translate) {
  const [phoneShowHidden, setPhoneShowHidden] = useState(false);
  const phoneHiddenRef = useRef(false);
  const [selected, setSelected] = useState<Map<string, LocalFileEntry>>(() => new Map());
  const browser = useLocalDirectoryBrowser({
    enabled: true,
    showHidden: phoneShowHidden,
    fallbackError: t('Could not read this folder.'),
    onError: setError,
    t,
  });

  const toggleShowHidden = useCallback(() => {
    if (!browser.path) return;
    phoneHiddenRef.current = !phoneHiddenRef.current;
    setPhoneShowHidden(phoneHiddenRef.current);
    browser.setEntries([]);
    void browser.loadDirectory(browser.path, phoneHiddenRef.current);
  }, [browser]);

  return {
    ...browser,
    phonePath: browser.path || null,
    phoneShowHidden,
    phoneHiddenRef,
    toggleShowHidden,
    selected,
    setSelected,
  };
}

export function useTransferPhoneSelection({ selected, setSelected }: Pick<ReturnType<typeof useTransferPhoneBrowser>, 'selected' | 'setSelected'>) {
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
