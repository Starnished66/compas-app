export type BackgroundStyle = 'artwork' | 'mesh' | 'noise';
export type ShaderBackgroundStyle = Exclude<BackgroundStyle, 'artwork'>;

export const DEFAULT_BACKGROUND_STYLE: BackgroundStyle = 'mesh';

export const BACKGROUND_STYLES: ReadonlyArray<BackgroundStyle> = ['artwork', 'mesh', 'noise'];

export const BACKGROUND_STYLE_LABELS: Record<BackgroundStyle, string> = {
  artwork: 'Album art',
  mesh: 'Gradient',
  noise: 'Noise',
};

export const BACKGROUND_STYLE_HINTS: Record<BackgroundStyle, string> = {
  artwork: 'The blurred album cover behind a soft wash.',
  mesh: 'A soft gradient in the accent colors.',
  noise: 'Warped noise that flows through the accent colors.',
};

export const SHADER_STYLE_ANIMATES: Record<ShaderBackgroundStyle, boolean> = {
  mesh: false,
  noise: true,
};

export function isBackgroundStyle(value: unknown): value is BackgroundStyle {
  return typeof value === 'string' && (BACKGROUND_STYLES as ReadonlyArray<string>).includes(value);
}

export function isShaderBackgroundStyle(style: BackgroundStyle): style is ShaderBackgroundStyle {
  return style !== 'artwork';
}
