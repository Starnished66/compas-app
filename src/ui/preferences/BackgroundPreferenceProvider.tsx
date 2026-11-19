import React, { useMemo } from 'react';
import { DEFAULT_BACKGROUND_STYLE, isBackgroundStyle } from '../backgroundStyle';
import { BackgroundPreferenceContext } from './backgroundPreferenceContext';
import { useStoredPreference } from './useStoredPreference';

const STORAGE_KEY = 'ui.backgroundStyle';

export function BackgroundPreferenceProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreference, restored] = useStoredPreference(STORAGE_KEY, DEFAULT_BACKGROUND_STYLE, isBackgroundStyle);
  const value = useMemo(() => ({ preference, setPreference, restored }), [preference, setPreference, restored]);
  return <BackgroundPreferenceContext.Provider value={value}>{children}</BackgroundPreferenceContext.Provider>;
}
