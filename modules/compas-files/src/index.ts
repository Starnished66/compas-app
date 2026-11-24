import { requireNativeModule } from 'expo-modules-core';

export interface StorageRoot {
  name: string;
  path: string;
  removable: boolean;
}

export interface LocalFileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modified: number;
}

export interface CollectedFile {
  path: string;
  name: string;
  /** Folder path relative to the selection, '' for files picked directly. */
  relativeDir: string;
  size: number;
}

interface CompasFilesNativeModule {
  hasStorageAccess(): boolean;
  hasWriteStorageAccess(): boolean;
  usesAllFilesAccess(): boolean;
  openAllFilesAccessSettings(): boolean;
  getRoots(): StorageRoot[];
  listDirectory(path: string, showHidden: boolean): Promise<LocalFileEntry[]>;
  collectFiles(paths: string[], showHidden: boolean): Promise<CollectedFile[]>;
  createDirectory(parentPath: string, name: string): Promise<string>;
  fileExists(path: string): boolean;
  uploadFile(taskId: string, url: string, fileUri: string, headers: Record<string, string>): Promise<{ status: number; body: string }>;
  /** With `exclusive`, an existing file is never replaced; the body goes to the next free name (`savedPath`). */
  downloadFile(taskId: string, url: string, fileUri: string, headers: Record<string, string>, exclusive: boolean): Promise<NativeDownloadResult>;
  cancelTransfer(taskId: string): void;
  addListener(eventName: 'onUploadProgress', listener: (event: { taskId: string; sent: number; total: number }) => void): { remove(): void };
  addListener(eventName: 'onDownloadProgress', listener: (event: { taskId: string; received: number; total: number }) => void): { remove(): void };
}

export interface NativeDownloadResult {
  status: number;
  headers: Record<string, string>;
  errorBody: string;
  savedPath?: string | null;
}

let nativeModule: CompasFilesNativeModule | null = null;
let nativeModuleResolved = false;

function getNativeModule(): CompasFilesNativeModule | null {
  if (nativeModuleResolved) return nativeModule;
  nativeModuleResolved = true;
  try {
    nativeModule = requireNativeModule<CompasFilesNativeModule>('CompasFiles');
  } catch {
    nativeModule = null;
  }
  return nativeModule;
}

function requireModule(): CompasFilesNativeModule {
  const module = getNativeModule();
  if (!module) throw new Error('File browsing is not available on this device');
  return module;
}

export function isFileBrowsingAvailable(): boolean {
  return getNativeModule() != null;
}

export function hasStorageAccess(): boolean {
  try {
    return getNativeModule()?.hasStorageAccess() ?? false;
  } catch {
    return false;
  }
}

export function hasWriteStorageAccess(): boolean {
  try {
    return getNativeModule()?.hasWriteStorageAccess() ?? false;
  } catch {
    return false;
  }
}

export function usesAllFilesAccess(): boolean {
  try {
    return getNativeModule()?.usesAllFilesAccess() ?? false;
  } catch {
    return false;
  }
}

export function openAllFilesAccessSettings(): boolean {
  try {
    return getNativeModule()?.openAllFilesAccessSettings() ?? false;
  } catch {
    return false;
  }
}

export function getStorageRoots(): StorageRoot[] {
  return requireModule().getRoots();
}

export function listLocalDirectory(path: string, showHidden = false): Promise<LocalFileEntry[]> {
  return requireModule().listDirectory(path, showHidden);
}

export function collectLocalFiles(paths: string[], showHidden = false): Promise<CollectedFile[]> {
  return requireModule().collectFiles(paths, showHidden);
}

export function createLocalDirectory(parentPath: string, name: string): Promise<string> {
  return requireModule().createDirectory(parentPath, name);
}

export function localFileExists(path: string): boolean {
  try {
    return getNativeModule()?.fileExists?.(path) ?? false;
  } catch {
    return false;
  }
}

/** Builds a file:// URI that native upload code decodes back to the exact path. */
export function localFileUri(path: string): string {
  return `file://${path.split('/').map(encodeURIComponent).join('/')}`;
}

/** Transfers on a native client that never follows a redirect, so the PIN header stays with the player. Null off Android. */
export function getPinSafeTransfers(): Pick<CompasFilesNativeModule, 'uploadFile' | 'downloadFile' | 'cancelTransfer' | 'addListener'> | null {
  const module = getNativeModule();
  return module && typeof module.uploadFile === 'function' ? module : null;
}

type PinSafeDownloads = Pick<CompasFilesNativeModule, 'downloadFile'> & {
  cancelTransfer(taskId: string): void | Promise<void>;
  addListener?: CompasFilesNativeModule['addListener'];
};

/** The native redirect-rejecting downloader; Android only, other platforms keep the base64 path. */
export function getPinSafeDownloads(): PinSafeDownloads | null {
  const android = getPinSafeTransfers();
  return typeof android?.downloadFile === 'function' ? android : null;
}
