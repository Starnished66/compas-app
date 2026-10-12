import { createContext } from 'react';
import { AccentStyle, DEFAULT_ACCENT_STYLE } from '../accentStyle';

export interface AccentPreferenceValue {
  preference: AccentStyle;
  setPreference(preference: AccentStyle): void;
}

export const AccentPreferenceContext = createContext<AccentPreferenceValue>({
  preference: DEFAULT_ACCENT_STYLE,
  setPreference: () => undefined,
});
