export interface ColorScheme {
  background: string;
  surface: string;
  surfaceVariant: string;
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  inversePrimary: string;
  secondary: string;
  onSecondary: string;
  secondaryContainer: string;
  onSecondaryContainer: string;
  tertiary: string;
  onTertiary: string;
  tertiaryContainer: string;
  onTertiaryContainer: string;
  onBackground: string;
  onSurface: string;
  onSurfaceVariant: string;
  outline: string;
  outlineVariant: string;
  surfaceDim: string;
  surfaceBright: string;
  surfaceContainerLowest: string;
  surfaceContainerLow: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  surfaceContainerHighest: string;
  surfaceTint: string;
}

export const DarkColors: ColorScheme = {
  background: '#111214',
  surface: '#1B1C1F',
  surfaceVariant: '#24262A',
  primary: '#B8BAC1',
  onPrimary: '#191A1D',
  primaryContainer: '#37393E',
  onPrimaryContainer: '#E4E5E9',
  inversePrimary: '#555860',
  secondary: '#B8BAC1',
  onSecondary: '#191A1D',
  secondaryContainer: '#37393E',
  onSecondaryContainer: '#E4E5E9',
  tertiary: '#AEB0B7',
  onTertiary: '#191A1D',
  tertiaryContainer: '#34363B',
  onTertiaryContainer: '#E1E2E6',
  onBackground: '#F1F1F4',
  onSurface: '#F1F1F4',
  onSurfaceVariant: '#B9BAC1',
  outline: '#414349',
  outlineVariant: '#414349',
  surfaceDim: '#111214',
  surfaceBright: '#393A3E',
  surfaceContainerLowest: '#0D0E10',
  surfaceContainerLow: '#191A1D',
  surfaceContainer: '#1D1E21',
  surfaceContainerHigh: '#25262A',
  surfaceContainerHighest: '#303135',
  surfaceTint: '#B8BAC1',
};

export const LightColors: ColorScheme = {
  background: '#F4F4F5',
  surface: '#FFFFFF',
  surfaceVariant: '#EDEEF0',
  primary: '#555860',
  onPrimary: '#FFFFFF',
  primaryContainer: '#E1E2E5',
  onPrimaryContainer: '#25262B',
  inversePrimary: '#B8BAC1',
  secondary: '#555860',
  onSecondary: '#FFFFFF',
  secondaryContainer: '#E1E2E5',
  onSecondaryContainer: '#25262B',
  tertiary: '#555860',
  onTertiary: '#FFFFFF',
  tertiaryContainer: '#E5E6E9',
  onTertiaryContainer: '#25262B',
  onBackground: '#25262B',
  onSurface: '#25262B',
  onSurfaceVariant: '#62646C',
  outline: '#D9DADD',
  outlineVariant: '#C6C8CC',
  surfaceDim: '#D3D4D7',
  surfaceBright: '#FFFFFF',
  surfaceContainerLowest: '#FFFFFF',
  surfaceContainerLow: '#F8F8F9',
  surfaceContainer: '#F2F2F4',
  surfaceContainerHigh: '#ECEDEF',
  surfaceContainerHighest: '#E6E7E9',
  surfaceTint: '#555860',
};

export interface ArtworkPalette {
  hue: number;
  saturation: number;
}

export function parseHexColor(hex: string): { r: number; g: number; b: number; a: number } {
  const clean = hex.replace('#', '');
  if (clean.length === 6) {
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    return { r, g, b, a: 1 };
  } else if (clean.length === 8) {
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    const a = parseInt(clean.substring(6, 8), 16) / 255;
    return { r, g, b, a };
  }
  return { r: 0, g: 0, b: 0, a: 1 };
}

export function toHexColor(r: number, g: number, b: number, a: number = 1): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const hex = [clamp(r), clamp(g), clamp(b)]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
  if (a < 1) {
    const alphaHex = clamp(a * 255).toString(16).padStart(2, '0');
    return `#${hex}${alphaHex}`;
  }
  return `#${hex}`;
}

export function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const c = v * s;
  const hp = (h % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0, g1 = 0, b1 = 0;
  if (hp >= 0 && hp < 1) { r1 = c; g1 = x; }
  else if (hp >= 1 && hp < 2) { r1 = x; g1 = c; }
  else if (hp >= 2 && hp < 3) { g1 = c; b1 = x; }
  else if (hp >= 3 && hp < 4) { g1 = x; b1 = c; }
  else if (hp >= 4 && hp < 5) { r1 = x; b1 = c; }
  else if (hp >= 5 && hp < 6) { r1 = c; b1 = x; }
  const m = v - c;
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

export function relativeLuminance(r: number, g: number, b: number): number {
  const srgb = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
}

export function contrastRatio(colorA: string, colorB: string): number {
  const a = parseHexColor(colorA);
  const b = parseHexColor(colorB);
  const lumA = relativeLuminance(a.r, a.g, a.b);
  const lumB = relativeLuminance(b.r, b.g, b.b);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

export function blendColors(surface: string, tint: string, amount: number): string {
  const s = parseHexColor(surface);
  const t = parseHexColor(tint);
  const r = s.r * (1 - amount) + t.r * amount;
  const g = s.g * (1 - amount) + t.g * amount;
  const b = s.b * (1 - amount) + t.b * amount;
  return toHexColor(r, g, b, s.a);
}

export function readableForeground(background: string): string {
  const darkFg = '#111214';
  const whiteFg = '#FFFFFF';
  return contrastRatio(whiteFg, background) >= contrastRatio(darkFg, background) ? whiteFg : darkFg;
}

export function tintedSurface(surface: string, accent: string, dark: boolean): string {
  const tintAmount = dark ? 0.24 : 0.12;
  return blendColors(surface, accent, tintAmount);
}

export function artworkAccent(palette: ArtworkPalette, dark: boolean): string {
  const fallback = dark ? DarkColors.primary : LightColors.primary;
  if (palette.saturation < 0.1) return fallback;

  const contrastSurfaces = dark
    ? [DarkColors.surface, DarkColors.surfaceVariant, DarkColors.surfaceContainerHighest, DarkColors.surfaceBright]
    : [LightColors.surface, LightColors.surfaceVariant, LightColors.surfaceDim, LightColors.surfaceContainerHighest];
  const navigationSurface = dark ? DarkColors.surface : LightColors.surface;

  let candidateSaturation = Math.max(0.4, Math.min(0.76, palette.saturation));
  const value = dark ? 0.88 : 0.36;

  while (candidateSaturation >= 0) {
    const rgb = hsvToRgb(palette.hue, candidateSaturation, value);
    const candidate = toHexColor(rgb.r, rgb.g, rgb.b);
    const selectedSurface = blendColors(navigationSurface, candidate, 0.12);

    const meetsAll =
      contrastSurfaces.every((s) => contrastRatio(candidate, s) >= 4.5) &&
      contrastRatio(candidate, selectedSurface) >= 4.5;

    if (meetsAll) {
      return candidate;
    }
    if (candidateSaturation === 0) break;
    candidateSaturation = Math.max(0, candidateSaturation - 0.02);
  }
  return fallback;
}

export function withArtworkPalette(baseColors: ColorScheme, palette: ArtworkPalette, dark: boolean): ColorScheme {
  const primary = artworkAccent(palette, dark);
  const secondary = artworkAccent({ hue: (palette.hue + 28) % 360, saturation: palette.saturation }, dark);
  const tertiary = artworkAccent({ hue: (palette.hue + 64) % 360, saturation: palette.saturation }, dark);
  const primaryContainer = tintedSurface(baseColors.surfaceVariant, primary, dark);
  const secondaryContainer = tintedSurface(baseColors.surfaceVariant, secondary, dark);
  const tertiaryContainer = tintedSurface(baseColors.surfaceVariant, tertiary, dark);

  return {
    ...baseColors,
    primary,
    onPrimary: readableForeground(primary),
    primaryContainer,
    onPrimaryContainer: readableForeground(primaryContainer),
    inversePrimary: artworkAccent(palette, !dark),
    secondary,
    onSecondary: readableForeground(secondary),
    secondaryContainer,
    onSecondaryContainer: readableForeground(secondaryContainer),
    tertiary,
    onTertiary: readableForeground(tertiary),
    tertiaryContainer,
    onTertiaryContainer: readableForeground(tertiaryContainer),
    surfaceTint: primary,
  };
}
