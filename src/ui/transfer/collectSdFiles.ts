import type { WifiImportFileEntry } from '../../data/types';
import { joinSdPath, type TransferSource } from '../../session/transferPlan';

/** Same cap as the phone side's native file collection. */
export const MAX_COLLECTED_FILES = 10000;

export interface SdSource extends TransferSource {
  /** The selected entry this file came from: the file itself, or the folder it was found under. */
  root: string;
}

export type ListSdFolder = (
  path: string,
  offset: number,
  showHidden?: boolean,
) => Promise<{ entries: WifiImportFileEntry[]; nextOffset: number | null }>;

export class TooManyFilesError extends Error {
  constructor() { super('Too many files'); }
}

/**
 * Expands selected SD entries into files. Folders are listed on the player, keeping their name as the
 * first segment of relativeDir. Throws TooManyFilesError over the cap and stops once the signal aborts.
 */
export async function collectSdFiles(
  selection: readonly WifiImportFileEntry[],
  list: ListSdFolder,
  showHidden: boolean,
  signal: AbortSignal,
  limit = MAX_COLLECTED_FILES,
): Promise<{ files: SdSource[]; folders: string[] }> {
  const sources: SdSource[] = [];
  /** Every folder reached, as a relative path, so empty ones are recreated on the phone too. */
  const folders: string[] = [];
  const seen = new Set<string>();
  const walked = new Set<string>();
  const add = (entry: WifiImportFileEntry, root: string, relativeDir: string) => {
    if (seen.has(entry.path)) return;
    if (seen.size >= limit) throw new TooManyFilesError();
    seen.add(entry.path);
    sources.push({ path: entry.path, name: entry.name, relativeDir, size: entry.size, root });
  };
  const walk = async (folder: WifiImportFileEntry, root: string, relativeDir: string) => {
    if (walked.has(folder.path)) return;
    walked.add(folder.path);
    folders.push(relativeDir);
    let offset: number | null = 0;
    while (offset !== null) {
      if (signal.aborted) throw new Error('Download cancelled');
      const page = await list(folder.path, offset, showHidden);
      for (const entry of page.entries) {
        if (entry.isDirectory) await walk(entry, root, joinSdPath(relativeDir, entry.name));
        else add(entry, root, relativeDir);
      }
      offset = page.nextOffset;
    }
  };
  // Anything inside another selected folder is downloaded as part of that folder, keeping its layout.
  const isInside = (entry: WifiImportFileEntry, folder: WifiImportFileEntry) => entry.path.startsWith(`${folder.path}/`);
  const selectedFolders = selection.filter((entry) => entry.isDirectory);
  // Folders inside no other selected folder; every other selection belongs to one of them.
  const outerFolders = selectedFolders.filter((folder) => !selectedFolders.some((other) => isInside(folder, other)));
  const outerFolderOf = (entry: WifiImportFileEntry) => outerFolders.find((folder) => isInside(entry, folder));
  const inner: [WifiImportFileEntry, WifiImportFileEntry][] = [];
  for (const entry of selection) {
    const outer = outerFolderOf(entry);
    if (outer) inner.push([entry, outer]);
    else if (entry.isDirectory) await walk(entry, entry.path, entry.name);
    else add(entry, entry.path, '');
  }
  // A selected entry the walk did not reach (a hidden file picked while hidden files were shown) still goes in its place.
  for (const [entry, outer] of inner) {
    const relativePath = joinSdPath(outer.name, entry.path.slice(outer.path.length + 1));
    if (entry.isDirectory) await walk(entry, outer.path, relativePath);
    else add(entry, outer.path, relativePath.slice(0, relativePath.lastIndexOf('/')));
  }
  return { files: sources, folders };
}
