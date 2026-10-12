import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export function useStoredPreference<T extends string>(
  storageKey: string,
  fallback: T,
  isValid: (value: unknown) => value is T,
): [T, (next: T) => void] {
  const [preference, setPreferenceState] = useState<T>(fallback);

  useEffect(() => {
    let current = true;
    AsyncStorage.getItem(storageKey)
      .then((stored) => {
        if (current && isValid(stored)) setPreferenceState(stored);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [storageKey, isValid]);

  const setPreference = useCallback(
    (next: T) => {
      setPreferenceState(next);
      AsyncStorage.setItem(storageKey, next).catch(() => {});
    },
    [storageKey],
  );

  return [preference, setPreference];
}
