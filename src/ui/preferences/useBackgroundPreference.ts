import { useContext } from 'react';
import { BackgroundPreferenceContext, BackgroundPreferenceValue } from './backgroundPreferenceContext';

export function useBackgroundPreference(): BackgroundPreferenceValue {
  return useContext(BackgroundPreferenceContext);
}
