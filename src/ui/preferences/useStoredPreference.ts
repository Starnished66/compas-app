import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export function useStoredPreference<T extends string>(
  storageKey: string,
  fallback: T,
  isValid: (value: unknown) => value is T,
): [preference: T, setPreference: (next: T) => void, restored: boolean] {
  const [state, setState] = useState({ preference: fallback, restored: false });

  useEffect(() => {
    let current = true;
    AsyncStorage.getItem(storageKey)
      .catch(() => null)
      .then((stored) => {
        if (!current) return;
        setState((previous) => ({
          preference: !previous.restored && isValid(stored) ? stored : previous.preference,
          restored: true,
        }));
      });
    return () => {
      current = false;
    };
  }, [storageKey, isValid]);

  const setPreference = useCallback(
    (next: T) => {
      setState({ preference: next, restored: true });
      AsyncStorage.setItem(storageKey, next).catch(() => {});
    },
    [storageKey],
  );

  return [state.preference, setPreference, state.restored];
}
