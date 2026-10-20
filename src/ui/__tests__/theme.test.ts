import {
  DarkColors,
  LightColors,
  contrastRatio,
  readableForeground,
  blendColors,
  artworkAccent,
  withArtworkPalette,
  withPlayerAccent,
  ArtworkPalette,
} from '../theme';

describe('UI Theme & Palette Engine', () => {
  test('contrastRatio computes WCAG compliant ratios', () => {
    // Black and white should have a contrast ratio close to 21:1
    const bwRatio = contrastRatio('#FFFFFF', '#000000');
    expect(bwRatio).toBeGreaterThan(20);

    // Identical colors should have contrast ratio of 1.0
    const sameRatio = contrastRatio('#111214', '#111214');
    expect(sameRatio).toBeCloseTo(1.0, 1);
  });

  test('readableForeground selects high-contrast text color', () => {
    // Dark background needs white/light text
    expect(readableForeground('#111214')).toBe('#FFFFFF');
    expect(readableForeground('#000000')).toBe('#FFFFFF');

    // Light background needs dark text
    expect(readableForeground('#FFFFFF')).toBe('#111214');
    expect(readableForeground('#F4F4F5')).toBe('#111214');
  });

  test('blendColors blends surface and accent colors proportionally', () => {
    const blended = blendColors('#000000', '#FFFFFF', 0.5);
    // Middle gray is #808080
    expect(blended.toLowerCase()).toBe('#808080');

    const blendedZero = blendColors('#112233', '#445566', 0.0);
    expect(blendedZero.toLowerCase()).toBe('#112233');

    const blendedOne = blendColors('#112233', '#445566', 1.0);
    expect(blendedOne.toLowerCase()).toBe('#445566');
  });

  test('artworkAccent falls back to primary when saturation is low', () => {
    const neutralPalette: ArtworkPalette = { hue: 120, saturation: 0.05 };
    const darkAccent = artworkAccent(neutralPalette, true);
    expect(darkAccent).toBe(DarkColors.primary);

    const lightAccent = artworkAccent(neutralPalette, false);
    expect(lightAccent).toBe(LightColors.primary);
  });

  test('artworkAccent produces accessible accent for saturated color', () => {
    const vibrantBluePalette: ArtworkPalette = { hue: 210, saturation: 0.8 };
    const darkAccent = artworkAccent(vibrantBluePalette, true);
    expect(darkAccent).toBeDefined();
    // In dark mode, accent against dark surface should meet 4.5:1 contrast
    expect(contrastRatio(darkAccent, DarkColors.surface)).toBeGreaterThanOrEqual(4.5);
  });

  // withArtworkPalette takes a non-null palette; App.tsx skips the call entirely when there is no artwork.
  test('withArtworkPalette keeps base accents when palette is unsaturated', () => {
    const neutralPalette: ArtworkPalette = { hue: 200, saturation: 0.05 };
    const themed = withArtworkPalette(DarkColors, neutralPalette, true);
    expect(themed.primary).toBe(DarkColors.primary);
    expect(themed.secondary).toBe(DarkColors.primary);
    expect(themed.tertiary).toBe(DarkColors.primary);
    expect(themed.background).toBe(DarkColors.background);
  });

  test('withArtworkPalette derives harmonic primary, secondary, and tertiary containers', () => {
    const vibrantPalette: ArtworkPalette = { hue: 280, saturation: 0.75 };
    const themed = withArtworkPalette(DarkColors, vibrantPalette, true);

    expect(themed.primary).not.toBe(DarkColors.primary);
    expect(themed.secondary).not.toBe(DarkColors.secondary);
    expect(themed.tertiary).not.toBe(DarkColors.tertiary);
    expect(themed.primaryContainer).toBeDefined();
    expect(themed.onPrimary).toBeDefined();
  });

  test('withPlayerAccent keeps accessible contrast and rejects malformed colors', () => {
    for (const [colors, dark] of [[DarkColors, true], [LightColors, false]] as const) {
      const themed = withPlayerAccent(colors, '#e53935', dark);
      expect(themed.primary).not.toBe(colors.primary);
      expect(contrastRatio(themed.primary, colors.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(themed.onPrimary, themed.primary)).toBeGreaterThanOrEqual(4.5);
      expect(withPlayerAccent(colors, '#fff', dark)).toBe(colors);
    }
  });
});
