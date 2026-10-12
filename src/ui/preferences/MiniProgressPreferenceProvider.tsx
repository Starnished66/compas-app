import React, { useMemo } from 'react';
import { isMiniProgressPreference } from '../miniProgress';
import { MiniProgressPreferenceContext } from './miniProgressPreferenceContext';
import { useStoredPreference } from './useStoredPreference';

const STORAGE_KEY = 'ui.miniPlayerProgress';

export function MiniProgressPreferenceProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreference] = useStoredPreference(STORAGE_KEY, 'auto', isMiniProgressPreference);
  const value = useMemo(() => ({ preference, setPreference }), [preference, setPreference]);
  return <MiniProgressPreferenceContext.Provider value={value}>{children}</MiniProgressPreferenceContext.Provider>;
}
