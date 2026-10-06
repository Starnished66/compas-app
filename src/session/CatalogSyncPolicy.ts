export function prioritizeCatalogItems<T>(
  items: T[],
  priorityKeys: string[],
  keyOf: (item: T) => string
): T[] {
  const priority = new Map<string, number>();
  priorityKeys.forEach((key, index) => {
    if (!priority.has(key)) {
      priority.set(key, index);
    }
  });

  return items
    .map((value, index) => ({ value, index }))
    .sort((a, b) => {
      const pA = priority.has(keyOf(a.value)) ? priority.get(keyOf(a.value))! : Number.MAX_SAFE_INTEGER;
      const pB = priority.has(keyOf(b.value)) ? priority.get(keyOf(b.value))! : Number.MAX_SAFE_INTEGER;
      if (pA !== pB) {
        return pA - pB;
      }
      return a.index - b.index;
    })
    .map((item) => item.value);
}

export function matchesStoredCatalogSnapshot(
  probedLibraryId: string,
  probedRevision: string,
  probedTotal: number,
  storedLibraryId?: string | null,
  storedRevision?: string | null,
  storedTotal?: number,
  storedSongCount?: number
): boolean {
  return (
    Boolean(probedLibraryId.trim()) &&
    Boolean(probedRevision.trim()) &&
    probedLibraryId === storedLibraryId &&
    probedRevision === storedRevision &&
    probedTotal === storedTotal &&
    storedSongCount === storedTotal
  );
}

export function canFinishCatalogSyncFromSnapshot(
  forceManifestRefresh: boolean,
  manifestComplete: boolean,
  pendingCoverCount: number
): boolean {
  return !forceManifestRefresh && manifestComplete && pendingCoverCount === 0;
}
