import type { ArtworkPalette } from '../theme';
import { AlbumPalette, extractPalette, identitySample, seedFromString } from './albumPalette';
import { dominantHue } from './artworkHue';
import type { artworkThumbnailPixels } from './artworkPixels';
import { createLruCache } from './lruCache';

export interface ArtworkColors {
  accent: ArtworkPalette | null;
  album: AlbumPalette;
}

interface Analysis {
  colors: Promise<ArtworkColors | null>;
  settled?: ArtworkColors | null;
}

const THUMBNAIL_SIZE = 24;
const CAPACITY = 24;

// Skia throws on import when its reanimated/worklets native side is unavailable,
// so artwork colors degrade to the fallback accent instead of crashing the app.
function loadPixelReader(): typeof artworkThumbnailPixels | null {
  try {
    return (require('./artworkPixels') as typeof import('./artworkPixels')).artworkThumbnailPixels;
  } catch (error) {
    if (__DEV__) console.warn('Artwork pixels unavailable', error);
    return null;
  }
}

const readPixels = loadPixelReader();
const analyses = createLruCache<string, Analysis>(CAPACITY);

function analyze(artwork: string, pixels: Uint8Array): ArtworkColors {
  return {
    accent: dominantHue(pixels),
    album: extractPalette(pixels, { seed: seedFromString(artwork) }),
  };
}

export function settledArtworkColors(artwork: string): ArtworkColors | null | undefined {
  return analyses.get(identitySample(artwork))?.settled;
}

export function artworkColors(artwork: string): Promise<ArtworkColors | null> {
  const key = identitySample(artwork);
  const cached = analyses.get(key);
  if (cached) return cached.colors;
  if (!readPixels) return Promise.resolve(null);
  const analysis: Analysis = {
    colors: readPixels(artwork, THUMBNAIL_SIZE).then((pixels) => (pixels ? analyze(artwork, pixels) : null)),
  };
  analysis.colors.then(
    (colors) => {
      analysis.settled = colors;
    },
    () => analyses.delete(key),
  );
  analyses.set(key, analysis);
  return analysis.colors;
}
