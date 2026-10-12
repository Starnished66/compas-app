import { createContext, useContext } from 'react';

export const TabActivityContext = createContext(true);

export function useTabActive(): boolean {
  return useContext(TabActivityContext);
}
