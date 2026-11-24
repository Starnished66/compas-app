import { useCallback, useEffect, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import { hasStorageAccess, hasWriteStorageAccess, openAllFilesAccessSettings, usesAllFilesAccess } from '../../modules/compas-files/src';
import { useAppActive } from './useAppActive';
import { useRequestGuard } from './useRequestGuard';

export type StorageAccessMode = 'read' | 'write';

export interface StorageAccess {
  granted: boolean;
  /** Opens the system grant flow; all-files access returns through the app resuming. */
  request: () => Promise<void>;
}

function checkStorageAccess(mode: StorageAccessMode): boolean {
  return mode === 'write' ? hasWriteStorageAccess() : hasStorageAccess();
}

export function useStorageAccess(mode: StorageAccessMode = 'read'): StorageAccess {
  const appActive = useAppActive();
  const requests = useRequestGuard();
  const [granted, setGranted] = useState(() => checkStorageAccess(mode));

  useEffect(() => {
    requests.invalidate();
    setGranted(checkStorageAccess(mode));
  }, [mode, requests]);

  // Re-check on resume: the all-files grant happens in system Settings.
  useEffect(() => {
    if (appActive) setGranted(checkStorageAccess(mode));
  }, [appActive, mode]);

  const request = useCallback(async () => {
    if (usesAllFilesAccess()) {
      openAllFilesAccessSettings();
      return;
    }
    const isCurrent = requests.next();
    if (Platform.OS === 'android') {
      if (mode === 'write') {
        await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
          PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
        ]);
      } else {
        await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE);
      }
    }
    if (!isCurrent()) return;
    setGranted(checkStorageAccess(mode));
  }, [mode, requests]);

  return { granted, request };
}
