import { useContext } from 'react';
import { MiniProgressPreferenceContext, MiniProgressPreferenceValue } from './miniProgressPreferenceContext';

export function useMiniProgressPreference(): MiniProgressPreferenceValue {
  return useContext(MiniProgressPreferenceContext);
}
