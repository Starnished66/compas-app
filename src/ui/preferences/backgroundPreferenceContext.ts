import { createContext } from 'react';
import { BackgroundStyle, DEFAULT_BACKGROUND_STYLE } from '../backgroundStyle';

export interface BackgroundPreferenceValue {
  preference: BackgroundStyle;
  setPreference(preference: BackgroundStyle): void;
}

export const BackgroundPreferenceContext = createContext<BackgroundPreferenceValue>({
  preference: DEFAULT_BACKGROUND_STYLE,
  setPreference: () => undefined,
});
