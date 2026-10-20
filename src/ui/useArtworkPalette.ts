import { useEffect, useMemo, useState } from 'react';
import { ArtworkPalette, ColorScheme, DarkColors, LightColors, withArtworkPalette, withPlayerAccent } from './theme';
import { Palette, paletteFrom } from './palette';
import { artworkColors } from './backdrop/artworkColors';

export type AccentSource =
  | { kind: 'neutral' }
  | { kind: 'pending' }
  | { kind: 'artwork'; uri: string }
  | { kind: 'player'; color: string };

const PENDING_ARTWORK_HOLD_MS = 2000;

function isUsablePalette(extracted: ArtworkPalette | null): extracted is ArtworkPalette {
  return !!extracted && Number.isFinite(extracted.hue) && Number.isFinite(extracted.saturation);
}

function reportExtractionFailure(uri: string, reason: unknown) {
  if (__DEV__) console.warn(`Artwork palette unavailable for ${uri.slice(0, 40)}…`, reason);
}

export function useArtworkPalette(source: AccentSource, dark: boolean): Palette {
  const [artworkPalette, setArtworkPalette] = useState<ArtworkPalette | null>(null);
  const uri = source.kind === 'artwork' ? source.uri : null;

  useEffect(() => {
    if (source.kind === 'neutral') {
      setArtworkPalette(null);
      return;
    }
    if (source.kind === 'player') {
      setArtworkPalette(null);
      return;
    }
    if (source.kind === 'pending') {
      const timer = setTimeout(() => setArtworkPalette(null), PENDING_ARTWORK_HOLD_MS);
      return () => clearTimeout(timer);
    }
    let current = true;
    if (source.kind !== 'artwork') return;
    artworkColors(source.uri)
      .then((colors) => {
        const extracted = colors?.accent ?? null;
        if (!isUsablePalette(extracted)) reportExtractionFailure(source.uri, extracted);
        if (current) setArtworkPalette(isUsablePalette(extracted) ? extracted : null);
      })
      .catch((error: unknown) => {
        reportExtractionFailure(source.uri, error);
        if (current) setArtworkPalette(null);
      });
    return () => {
      current = false;
    };
  }, [source.kind, uri]);

  return useMemo(() => {
    const base: ColorScheme = dark ? DarkColors : LightColors;
    const colors = source.kind === 'player'
      ? withPlayerAccent(base, source.color, dark)
      : artworkPalette ? withArtworkPalette(base, artworkPalette, dark) : base;
    return paletteFrom(colors, dark);
  }, [artworkPalette, dark, source.kind, source.kind === 'player' ? source.color : null]);
}
