import { createContext } from 'react';
import { MiniProgressPreference } from '../miniProgress';

export interface MiniProgressPreferenceValue {
  preference: MiniProgressPreference;
  setPreference(preference: MiniProgressPreference): void;
}

export const MiniProgressPreferenceContext = createContext<MiniProgressPreferenceValue>({
  preference: 'auto',
  setPreference: () => undefined,
});
