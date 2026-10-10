import { ColorScheme, DarkColors, LightColors, tintedSurface } from './theme';

export interface Palette {
  dark: boolean;
  background: string;
  surface: string;
  surfaceRaised: string;
  frost: string;
  scrim: string;
  ink: string;
  inkMuted: string;
  outline: string;
  accent: string;
  onAccent: string;
  accentContainer: string;
  onAccentContainer: string;
  statusOk: string;
  statusBusy: string;
  statusIdle: string;
  statusError: string;
}

const statusColors = {
  statusOk: '#8DBB50',
  statusBusy: '#E5B65B',
  statusIdle: '#9CA0A6',
  statusError: '#E06C62',
};

type AccentColors = Pick<Palette, 'accent' | 'onAccent' | 'accentContainer' | 'onAccentContainer'>;

const fallbackAccent: Record<'dark' | 'light', AccentColors> = {
  dark: { accent: '#96D8BC', onAccent: '#191A1D', accentContainer: '#485955', onAccentContainer: '#E6F4EE' },
  light: { accent: '#2E6A55', onAccent: '#FFFFFF', accentContainer: '#D5E8E0', onAccentContainer: '#16302A' },
};

function accentColors(colors: ColorScheme, base: ColorScheme, dark: boolean): AccentColors {
  if (colors.primary === base.primary) return fallbackAccent[dark ? 'dark' : 'light'];
  return {
    accent: colors.primary,
    onAccent: base.onPrimary,
    accentContainer: tintedSurface(base.surfaceContainerHighest, colors.primary, dark),
    onAccentContainer: base.onSurface,
  };
}

export function paletteFrom(colors: ColorScheme, dark: boolean): Palette {
  const base = dark ? DarkColors : LightColors;
  return {
    dark,
    background: base.background,
    surface: base.surface,
    surfaceRaised: base.surfaceContainerHighest,
    frost: dark ? 'rgba(29,30,34,0.56)' : 'rgba(255,255,255,0.62)',
    scrim: 'rgba(0,0,0,0.5)',
    ink: base.onSurface,
    inkMuted: base.onSurfaceVariant,
    outline: base.outline,
    ...accentColors(colors, base, dark),
    ...statusColors,
  };
}
