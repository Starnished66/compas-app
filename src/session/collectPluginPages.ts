export interface PluginPageMetadata {
  offset: number;
  limit: number;
  total: number;
}

export interface PluginPageCollection<T, P> {
  first: P;
  items: T[];
  total: number;
  truncated: boolean;
}

/** Collect ordered offset pages without exceeding the requested scan bound. */
export async function collectPluginPages<T, P extends PluginPageMetadata>(
  fetchPage: (offset: number, limit: number) => Promise<P>,
  readItems: (page: P) => T[],
  maxItems: number,
  pageSize = 50,
): Promise<PluginPageCollection<T, P>> {
  const first = await fetchPage(0, pageSize);
  const firstItems = readItems(first);
  const items = [...firstItems];
  const seenIds = new Set<string>();
  const checkIds = (pageItems: T[]) => {
    for (const item of pageItems) {
      const id = item && typeof item === 'object' ? (item as { id?: unknown }).id : undefined;
      if (typeof id !== 'string') continue;
      if (seenIds.has(id)) throw new Error('The player returned duplicate plugin entries.');
      seenIds.add(id);
    }
  };
  checkIds(firstItems);
  const limit = Math.min(first.total, maxItems);
  let offset = first.offset + firstItems.length;
  while (offset < limit) {
    const page = await fetchPage(offset, pageSize);
    const pageItems = readItems(page);
    if (page.offset !== offset || page.total !== first.total || page.limit !== first.limit || !pageItems.length || page.offset + pageItems.length <= offset) {
      throw new Error('The player returned an incomplete plugin list.');
    }
    checkIds(pageItems);
    items.push(...pageItems);
    offset = page.offset + pageItems.length;
  }
  return { first, items: items.slice(0, maxItems), total: first.total, truncated: items.length < first.total };
}
