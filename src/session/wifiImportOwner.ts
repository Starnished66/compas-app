/** Keeps the import manager mounted across transport upgrades for one player. */
export function isSameWifiImportOwner(previous: string | null, current: string | null): boolean {
  return previous !== null && current !== null && previous === current;
}
