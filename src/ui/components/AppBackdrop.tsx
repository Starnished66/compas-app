import React from 'react';
import { accentFollowsArtwork } from '../accentStyle';
import { isShaderBackgroundStyle } from '../backgroundStyle';
import { useAccentPreference } from '../preferences/useAccentPreference';
import { useBackgroundPreference } from '../preferences/useBackgroundPreference';
import { ArtworkBackdrop } from './ArtworkBackdrop';
import type { ShaderBackdrop as ShaderBackdropComponent } from './ShaderBackdrop';

export interface AppBackdropProps {
  artworkUri?: string | null;
  prominent?: boolean;
  paused?: boolean;
}

// Skia throws on import when its reanimated/worklets native side is unavailable,
// so the shader backdrop is optional and the app falls back to album art.
function loadShaderBackdrop(): typeof ShaderBackdropComponent | null {
  try {
    return (require('./ShaderBackdrop') as typeof import('./ShaderBackdrop')).ShaderBackdrop;
  } catch (error) {
    if (__DEV__) console.warn('Shader backgrounds unavailable, using album art', error);
    return null;
  }
}

const ShaderBackdrop = loadShaderBackdrop();

export function AppBackdrop({ artworkUri = null, prominent = false, paused = false }: AppBackdropProps) {
  const { preference } = useBackgroundPreference();
  const { preference: accentStyle } = useAccentPreference();
  if (!ShaderBackdrop || !isShaderBackgroundStyle(preference)) {
    return <ArtworkBackdrop artworkUri={artworkUri} prominent={prominent} />;
  }
  const colorArtworkUri = accentFollowsArtwork(accentStyle) ? artworkUri : null;
  return <ShaderBackdrop style={preference} artworkUri={colorArtworkUri} prominent={prominent} paused={paused} />;
}
