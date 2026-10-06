import type { ImageSourcePropType } from 'react-native';

/** Artwork can come from the API as base64 or from the cache as a URI. */
export function artworkImageSource(uri?: string | null): ImageSourcePropType | null {
  if (!uri) return null;
  if (/^(data:|https?:|file:|content:)/i.test(uri)) return { uri };
  return { uri: `data:image/jpeg;base64,${uri}` };
}
