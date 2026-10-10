import React, { useCallback, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isMiniProgressPreference, MiniProgressPreference } from '../miniProgress';
import { MiniProgressPreferenceContext } from './miniProgressPreferenceContext';

const STORAGE_KEY = 'ui.miniPlayerProgress';

export function MiniProgressPreferenceProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<MiniProgressPreference>('auto');

  useEffect(() => {
    let current = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (current && isMiniProgressPreference(stored)) setPreferenceState(stored);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, []);

  const setPreference = useCallback((next: MiniProgressPreference) => {
    setPreferenceState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);

  const value = useMemo(() => ({ preference, setPreference }), [preference, setPreference]);
  return <MiniProgressPreferenceContext.Provider value={value}>{children}</MiniProgressPreferenceContext.Provider>;
}
