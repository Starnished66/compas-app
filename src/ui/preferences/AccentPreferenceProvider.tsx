import React, { useMemo } from 'react';
import { DEFAULT_ACCENT_STYLE, isAccentStyle } from '../accentStyle';
import { AccentPreferenceContext } from './accentPreferenceContext';
import { useStoredPreference } from './useStoredPreference';

const STORAGE_KEY = 'ui.accentStyle';

export function AccentPreferenceProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreference] = useStoredPreference(STORAGE_KEY, DEFAULT_ACCENT_STYLE, isAccentStyle);
  const value = useMemo(() => ({ preference, setPreference }), [preference, setPreference]);
  return <AccentPreferenceContext.Provider value={value}>{children}</AccentPreferenceContext.Provider>;
}
