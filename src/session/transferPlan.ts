export interface TransferSource {
  path: string;
  name: string;
  /** Folder path relative to the selection, '' for files picked directly. */
  relativeDir: string;
  size: number;
}

export interface PlannedUpload<S extends TransferSource = TransferSource> {
  source: S;
  /** SD card folder the file is written into, relative to the card root. */
  destination: string;
}

export interface TransferPlan<S extends TransferSource = TransferSource> {
  /** Folders to create, parents before children, as [parent, name] pairs. */
  directories: [string, string][];
  uploads: PlannedUpload<S>[];
  totalBytes: number;
}

export function joinSdPath(parent: string, child: string): string {
  if (!parent) return child;
  if (!child) return parent;
  return `${parent}/${child}`;
}

export function sdParent(path: string): string | null {
  if (!path) return null;
  const index = path.lastIndexOf('/');
  return index < 0 ? '' : path.slice(0, index);
}

/**
 * Maps selected files onto the destination, keeping picked folders' structure. `folders` lists extra relative
 * folders to create even when no file lands in them, such as empty ones.
 */
export function planTransfer<S extends TransferSource>(
  sources: readonly S[], destination: string, folders: readonly string[] = [],
): TransferPlan<S> {
  const directories: [string, string][] = [];
  const seen = new Set<string>();
  const uploads: PlannedUpload<S>[] = [];
  let totalBytes = 0;
  const folderFor = (relativeDir: string) => {
    let parent = destination;
    for (const segment of relativeDir.split('/').filter(Boolean)) {
      const path = joinSdPath(parent, segment);
      if (!seen.has(path)) {
        seen.add(path);
        directories.push([parent, segment]);
      }
      parent = path;
    }
    return parent;
  };
  for (const folder of folders) folderFor(folder);
  for (const source of sources) {
    uploads.push({ source, destination: folderFor(source.relativeDir) });
    totalBytes += source.size;
  }
  return { directories, uploads, totalBytes };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KiB', 'MiB', 'GiB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

export function sdBreadcrumb(path: string, rootLabel: string): string {
  return [rootLabel, ...path.split('/').filter(Boolean)].join(' / ');
}

/** Counts picked items, without walking folders or double-counting their contents. */
export function selectionTotals(entries: readonly { isDirectory: boolean; size: number }[]) {
  return entries.reduce((total, entry) => ({
    count: total.count + 1,
    folders: total.folders + (entry.isDirectory ? 1 : 0),
    bytes: total.bytes + (entry.isDirectory ? 0 : entry.size),
  }), { count: 0, folders: 0, bytes: 0 });
}
