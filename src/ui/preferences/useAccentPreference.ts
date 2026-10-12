import { useContext } from 'react';
import { AccentPreferenceContext, AccentPreferenceValue } from './accentPreferenceContext';

export function useAccentPreference(): AccentPreferenceValue {
  return useContext(AccentPreferenceContext);
}
