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
  usesAllFilesAccess(): boolean;
  openAllFilesAccessSettings(): boolean;
  getRoots(): StorageRoot[];
  listDirectory(path: string): Promise<LocalFileEntry[]>;
  collectFiles(paths: string[]): Promise<CollectedFile[]>;
  uploadFile(taskId: string, url: string, fileUri: string, headers: Record<string, string>): Promise<{ status: number; body: string }>;
  downloadFile(taskId: string, url: string, fileUri: string, headers: Record<string, string>): Promise<NativeDownloadResult>;
  cancelTransfer(taskId: string): void;
  addListener(eventName: 'onUploadProgress', listener: (event: { taskId: string; sent: number; total: number }) => void): { remove(): void };
}

export interface NativeDownloadResult {
  status: number;
  headers: Record<string, string>;
  errorBody: string;
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

export function listLocalDirectory(path: string): Promise<LocalFileEntry[]> {
  return requireModule().listDirectory(path);
}

export function collectLocalFiles(paths: string[]): Promise<CollectedFile[]> {
  return requireModule().collectFiles(paths);
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
