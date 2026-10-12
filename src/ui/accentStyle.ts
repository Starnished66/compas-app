// TODO: allow accent style "player" when DAP accent color is syncable
export type AccentStyle = 'artwork' | 'teal';

export const DEFAULT_ACCENT_STYLE: AccentStyle = 'artwork';

export const ACCENT_STYLES: ReadonlyArray<AccentStyle> = ['artwork', 'teal',
  // 'player'
];

export const ACCENT_STYLE_LABELS: Record<AccentStyle, string> = {
  artwork: 'Album art',
  teal: 'Teal',
  // player: 'Player',
};

export const ACCENT_STYLE_HINTS: Record<AccentStyle, string> = {
  artwork: 'Buttons and backgrounds take on the colors of the current cover.',
  teal: 'The app’s signature teal.',
  // player: 'Matches the accent color set on the player.',
};

export function isAccentStyle(value: unknown): value is AccentStyle {
  return typeof value === 'string' && (ACCENT_STYLES as ReadonlyArray<string>).includes(value);
}

export function accentFollowsArtwork(style: AccentStyle): boolean {
  return style === 'artwork';
}
