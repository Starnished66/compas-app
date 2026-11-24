import type { WifiImportFileEntry } from '../../data/types';

/** Drops selected SD files at or under `path`; renaming or deleting them makes the selection point nowhere. */
export function withoutSelectionsUnder(selected: Map<string, WifiImportFileEntry>, path: string) {
  const next = new Map(selected);
  for (const key of selected.keys()) if (key === path || key.startsWith(`${path}/`)) next.delete(key);
  return next.size === selected.size ? selected : next;
}
