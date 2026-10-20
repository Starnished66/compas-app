import { requireNativeModule } from 'expo-modules-core';

export interface AppVersion {
  version: string;
  versionCode: number;
}

export type ReleaseKind = 'firmware' | 'application';

interface CompasUpdatesNativeModule {
  getAppVersion(): AppVersion;
  notificationsEnabled(): boolean;
  notifyRelease(kind: ReleaseKind, version: string, url: string): boolean;
}

let nativeModule: CompasUpdatesNativeModule | null = null;
let nativeModuleResolved = false;

function getNativeModule(): CompasUpdatesNativeModule | null {
  if (nativeModuleResolved) return nativeModule;
  nativeModuleResolved = true;
  try {
    nativeModule = requireNativeModule<CompasUpdatesNativeModule>('CompasUpdates');
  } catch {
    nativeModule = null;
  }
  return nativeModule;
}

export function getAppVersion(): AppVersion | null {
  try {
    return getNativeModule()?.getAppVersion() ?? null;
  } catch {
    return null;
  }
}

export function notificationsEnabled(): boolean {
  try {
    return getNativeModule()?.notificationsEnabled() ?? false;
  } catch {
    return false;
  }
}

export function notifyRelease(kind: ReleaseKind, version: string, url: string): boolean {
  try {
    return getNativeModule()?.notifyRelease(kind, version, url) ?? false;
  } catch {
    return false;
  }
}
