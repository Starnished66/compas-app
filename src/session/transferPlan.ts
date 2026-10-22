export interface TransferSource {
  path: string;
  name: string;
  /** Folder path relative to the selection, '' for files picked directly. */
  relativeDir: string;
  size: number;
}

export interface PlannedUpload {
  source: TransferSource;
  /** SD card folder the file is written into, relative to the card root. */
  destination: string;
}

export interface TransferPlan {
  /** Folders to create, parents before children, as [parent, name] pairs. */
  directories: [string, string][];
  uploads: PlannedUpload[];
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

/** Maps selected phone files onto the SD card destination, keeping picked folders' structure. */
export function planTransfer(sources: readonly TransferSource[], destination: string): TransferPlan {
  const directories: [string, string][] = [];
  const seen = new Set<string>();
  const uploads: PlannedUpload[] = [];
  let totalBytes = 0;
  for (const source of sources) {
    let parent = destination;
    for (const segment of source.relativeDir.split('/').filter(Boolean)) {
      const path = joinSdPath(parent, segment);
      if (!seen.has(path)) {
        seen.add(path);
        directories.push([parent, segment]);
      }
      parent = path;
    }
    uploads.push({ source, destination: parent });
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
