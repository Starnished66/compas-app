import React, { createContext, useContext } from 'react';
import { DarkColors } from './theme';
import { Palette, paletteFrom } from './palette';

const PaletteContext = createContext<Palette>(paletteFrom(DarkColors, true));

export function usePalette(): Palette {
  return useContext(PaletteContext);
}

export function PaletteProvider({ palette, children }: { palette: Palette; children: React.ReactNode }) {
  return <PaletteContext.Provider value={palette}>{children}</PaletteContext.Provider>;
}
