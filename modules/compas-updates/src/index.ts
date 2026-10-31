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
  canInstallAppUpdates(): boolean;
  openAppUpdatePermissionSettings(): void;
  getDeviceApiLevel(): number;
  installAppUpdate(url: string, sha256: string, versionCode: number, size: number): Promise<void>;
  fetchAppUpdateManifest(channel: 'stable' | 'beta'): Promise<{ status: number; body: string }>;
}

export function canInstallAppUpdates(): boolean {
  try { return getNativeModule()?.canInstallAppUpdates() ?? false; } catch { return false; }
}

export function openAppUpdatePermissionSettings(): void {
  getNativeModule()?.openAppUpdatePermissionSettings();
}

export function getDeviceApiLevel(): number {
  try { return getNativeModule()?.getDeviceApiLevel() ?? 0; } catch { return 0; }
}

export async function installAppUpdate(url: string, sha256: string, versionCode: number, size: number): Promise<void> {
  const module = getNativeModule();
  if (!module) throw new Error('Application updates are available only on Android.');
  await module.installAppUpdate(url, sha256, versionCode, size);
}

export async function fetchAppUpdateManifest(channel: 'stable' | 'beta' = 'stable'): Promise<{ status: number; body: string }> {
  const module = getNativeModule();
  if (!module) throw new Error('Application update feed is available only on Android.');
  return module.fetchAppUpdateManifest(channel);
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
