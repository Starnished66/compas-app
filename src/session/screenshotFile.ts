import type { WifiImportDirectoryPage, WifiImportFileEntry } from '../data/types';

export const SCREENSHOTS_DIR = 'Screenshots';

function isDirectoryMissingError(cause: any): boolean {
  return cause?.statusCode === 404 || String(cause?.responseBody ?? cause?.message ?? '').includes('directory_not_found');
}

/** Paginates through the entire Screenshots directory on the player SD card. */
export async function listAllScreenshots(
  list: (path: string, offset: number, showHidden?: boolean) => Promise<Pick<WifiImportDirectoryPage, 'entries' | 'nextOffset'>>,
  signal?: AbortSignal,
): Promise<WifiImportFileEntry[]> {
  const entries: WifiImportFileEntry[] = [];
  let offset: number | null = 0;
  while (offset !== null) {
    if (signal?.aborted) throw new Error('Screenshot cancelled');
    try {
      const result = await list(SCREENSHOTS_DIR, offset, false);
      entries.push(...result.entries);
      if (result.nextOffset !== null && result.nextOffset <= offset) break;
      offset = result.nextOffset;
    } catch (cause) {
      if (offset === 0 && isDirectoryMissingError(cause)) return [];
      throw cause;
    }
  }
  return entries;
}

/**
 * Returns the newest PNG screenshot whose name was not present before capture.
 * Never falls back to an existing file.
 */
export function findLatestScreenshot(
  entries: readonly WifiImportFileEntry[],
  previousNames: ReadonlySet<string>,
): WifiImportFileEntry | null {
  const pngs = entries
    .filter((entry) => !entry.isDirectory && /\.png$/i.test(entry.name))
    .sort((a, b) => b.name.localeCompare(a.name));
  return pngs.find((entry) => !previousNames.has(entry.name)) ?? null;
}
