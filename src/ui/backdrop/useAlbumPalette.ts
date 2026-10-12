import { useEffect, useMemo, useState } from 'react';
import { parseColor } from '../colorMix';
import { accentPalette, AlbumPalette, seedFromString } from './albumPalette';
import { artworkColors, settledArtworkColors } from './artworkColors';
import { rgbToOklab, Vec3 } from './oklab';

export interface AlbumColors {
  palette: AlbumPalette;
  seed: number;
}

interface Extraction {
  artwork: string;
  palette: AlbumPalette | null;
}

const NEUTRAL_LAB: Vec3 = [0.5, 0, 0];

function fallbackPalette(accent: string): AlbumPalette {
  const color = parseColor(accent);
  return accentPalette(color ? rgbToOklab(color.r, color.g, color.b) : NEUTRAL_LAB);
}

function settledExtraction(artwork: string | null): Extraction | null {
  const colors = artwork ? settledArtworkColors(artwork) : undefined;
  return artwork && colors !== undefined ? { artwork, palette: colors?.album ?? null } : null;
}

export function useAlbumPalette(artwork: string | null, fallbackAccent: string): AlbumColors {
  const [extraction, setExtraction] = useState(() => settledExtraction(artwork));
  const fallback = useMemo(() => fallbackPalette(fallbackAccent), [fallbackAccent]);

  useEffect(() => {
    if (!artwork) return;
    let current = true;
    artworkColors(artwork)
      .then((colors) => {
        if (current) setExtraction({ artwork, palette: colors?.album ?? null });
      })
      .catch((error: unknown) => {
        if (__DEV__) console.warn('Backdrop palette unavailable', error);
        if (current) setExtraction({ artwork, palette: null });
      });
    return () => {
      current = false;
    };
  }, [artwork]);

  const held = artwork && extraction?.palette ? extraction : null;
  const seedSource = held?.artwork ?? artwork ?? '';
  const seed = useMemo(() => seedFromString(seedSource), [seedSource]);
  const palette = held?.palette ?? fallback;
  return useMemo(() => ({ palette, seed }), [palette, seed]);
}
