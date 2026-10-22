import { useCallback, useEffect, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import { hasStorageAccess, openAllFilesAccessSettings, usesAllFilesAccess } from '../../modules/compas-files/src';
import { useAppActive } from './useAppActive';

export interface StorageAccess {
  granted: boolean;
  /** Opens the system grant flow; all-files access returns through the app resuming. */
  request: () => Promise<void>;
}

export function useStorageAccess(): StorageAccess {
  const appActive = useAppActive();
  const [granted, setGranted] = useState(hasStorageAccess);

  // Re-check on resume: the all-files grant happens in system Settings.
  useEffect(() => {
    if (appActive) setGranted(hasStorageAccess());
  }, [appActive]);

  const request = useCallback(async () => {
    if (usesAllFilesAccess()) {
      openAllFilesAccessSettings();
      return;
    }
    if (Platform.OS === 'android') {
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE);
    }
    setGranted(hasStorageAccess());
  }, []);

  return { granted, request };
}
