import React, { createContext, useContext } from 'react';
import { DarkColors } from './theme';
import { Palette, paletteFrom } from './palette';
import { useAnimatedPalette } from './useAnimatedPalette';

const PaletteContext = createContext<Palette>(paletteFrom(DarkColors, true));

export function usePalette(): Palette {
  return useContext(PaletteContext);
}

export function PaletteProvider({ palette, children }: { palette: Palette; children: React.ReactNode }) {
  const animatedPalette = useAnimatedPalette(palette);
  return <PaletteContext.Provider value={animatedPalette}>{children}</PaletteContext.Provider>;
}
