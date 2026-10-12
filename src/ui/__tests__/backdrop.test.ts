import { dominantHue } from '../backdrop/artworkHue';
import { accentPalette, extractPalette, seedFromString } from '../backdrop/albumPalette';
import { backdropUniforms, blendUniforms, luminanceBudget, PALETTE_SIZE, tamePalette } from '../backdrop/backdropUniforms';
import { createLruCache } from '../backdrop/lruCache';
import { linearToOklab, luminance, rgbToOklab, srgbToLinear, Vec3 } from '../backdrop/oklab';
import { isBackgroundStyle } from '../backgroundStyle';

function checkerPixels(colors: ReadonlyArray<Vec3>, count: number): Uint8Array {
  const pixels = new Uint8Array(count * 4);
  for (let i = 0; i < count; i++) {
    const [r, g, b] = colors[i % colors.length];
    pixels.set([r, g, b, 255], i * 4);
  }
  return pixels;
}

const COVER = checkerPixels(
  [
    [200, 30, 40],
    [20, 40, 160],
    [240, 220, 200],
    [10, 10, 10],
    [60, 160, 70],
  ],
  48 * 48,
);

const WHITE_TEXT_LUMINANCE = 1;
const DARK_TEXT_LUMINANCE = luminance([0x15, 0x13, 0x1a].map(srgbToLinear) as Vec3);
const contrast = (lighter: number, darker: number) => (lighter + 0.05) / (darker + 0.05);

describe('album palette', () => {
  it('hashes seeds with FNV-1a', () => {
    expect(seedFromString('a')).toBe(0xe40c292c);
    expect(seedFromString('album')).toBe(seedFromString('album'));
  });

  it('seeds long data URIs from a sample that still tells covers apart', () => {
    const cover = (fill: string) => `data:image/jpeg;base64,${fill.repeat(200_000)}`;
    expect(seedFromString(cover('A'))).toBe(seedFromString(cover('A')));
    expect(seedFromString(cover('A'))).not.toBe(seedFromString(cover('B')));
    expect(seedFromString(cover('A'))).not.toBe(seedFromString(`${cover('A')}A`));
  });

  it('extracts a deterministic palette sorted by share', () => {
    const palette = extractPalette(COVER, { seed: 7 });
    expect(palette).toEqual(extractPalette(COVER, { seed: 7 }));
    expect(palette).toHaveLength(5);
    expect(palette.reduce((sum, color) => sum + color.share, 0)).toBeCloseTo(1);
    palette.slice(1).forEach((color, i) => expect(color.share).toBeLessThanOrEqual(palette[i].share));
  });

  it('builds a fallback from the accent that keeps its hue instead of turning grey', () => {
    const accent = rgbToOklab(0x96, 0xd8, 0xbc);
    const hue = (lab: Vec3) => Math.atan2(lab[2], lab[1]);
    for (const theme of ['dark', 'light'] as const) {
      tamePalette(accentPalette(accent), theme, 0.15).forEach((linear) => {
        const lab = linearToOklab(linear);
        expect(Math.hypot(lab[1], lab[2])).toBeGreaterThan(0.05);
        expect(Math.abs(hue(lab) - hue(accent))).toBeLessThan(0.1);
      });
    }
  });

  it('keeps a neutral accent neutral', () => {
    accentPalette([0.5, 0, 0]).forEach((color) => expect(color.lab.slice(1)).toEqual([0, 0]));
  });

  it('falls back to a single color when every pixel is transparent', () => {
    const palette = extractPalette(new Uint8Array(16), { k: 1 });
    expect(palette).toEqual([{ lab: [0.3, 0, 0], share: 1 }]);
  });
});

describe('artwork hue', () => {
  test('picks the most weighted saturated hue and ignores neutrals', () => {
    const pixels = checkerPixels(
      [
        [200, 40, 30],
        [210, 70, 30],
        [20, 40, 160],
        [240, 240, 240],
        [10, 10, 10],
      ],
      48 * 48,
    );
    const hue = dominantHue(pixels);
    expect(hue).not.toBeNull();
    expect(hue!.hue).toBeGreaterThan(0);
    expect(hue!.hue).toBeLessThan(30);
    expect(hue!.saturation).toBeGreaterThan(0.7);
  });

  test('returns null for grayscale or transparent artwork', () => {
    expect(dominantHue(checkerPixels([[128, 128, 128], [20, 20, 20]], 64))).toBeNull();
    const transparent = checkerPixels([[200, 30, 40]], 64).map((value, i) => (i % 4 === 3 ? 0 : value));
    expect(dominantHue(transparent)).toBeNull();
  });
});

describe('lru cache', () => {
  it('keeps recently used entries and evicts the oldest', () => {
    const cache = createLruCache<string, number>(24);
    cache.set('first', 1);
    for (let i = 0; i < 23; i++) cache.set(`filler-${i}`, i);
    expect(cache.get('first')).toBe(1);
    cache.set('overflow', 0);
    expect(cache.get('first')).toBe(1);
    expect(cache.get('filler-0')).toBeUndefined();
  });
});

describe('backdrop uniforms', () => {
  it.each(['dark', 'light'] as const)('keeps every %s color inside the luminance band', (theme) => {
    for (const focus of [0, 0.35, 1]) {
      const uniforms = backdropUniforms({ palette: extractPalette(COVER), seed: 3, theme, focus, width: 10, height: 20 });
      const { lo, hi } = luminanceBudget(theme, focus);
      for (let i = 0; i < PALETTE_SIZE; i++) {
        const y = luminance(uniforms[`uPal${i}`] as Vec3);
        expect(y).toBeGreaterThanOrEqual(lo - 1e-6);
        expect(y).toBeLessThanOrEqual(hi + 1e-6);
      }
      const ramp = Array.from({ length: PALETTE_SIZE }, (_, i) => luminance(uniforms[`uRamp${i}`] as Vec3));
      expect(ramp).toEqual([...ramp].sort((a, b) => a - b));
    }
  });

  it('pads short palettes to five colors', () => {
    const uniforms = backdropUniforms({
      palette: [{ lab: [0.6, 0.1, 0.05], share: 1 }],
      seed: 0,
      theme: 'dark',
      focus: 0.35,
      width: 100,
      height: 200,
    });
    expect(uniforms.uRes).toEqual([100, 200]);
    expect(uniforms.uW4).toBe(1);
  });

  it('crossfades between uniforms without leaving the luminance band', () => {
    const inputs = { seed: 3, theme: 'dark', focus: 0.35, width: 10, height: 20 } as const;
    const from = backdropUniforms({ ...inputs, palette: extractPalette(COVER) });
    const to = backdropUniforms({ ...inputs, palette: [{ lab: [0.9, -0.1, 0.15], share: 1 }] });
    expect(blendUniforms(from, to, 0)).toEqual(from);
    expect(blendUniforms(from, to, 1)).toEqual(to);
    const { lo, hi } = luminanceBudget('dark', 0.35);
    for (const progress of [0.25, 0.5, 0.75]) {
      const blended = blendUniforms(from, to, progress);
      for (let i = 0; i < PALETTE_SIZE; i++) {
        const y = luminance(blended[`uPal${i}`] as Vec3);
        expect(y).toBeGreaterThanOrEqual(lo - 1e-6);
        expect(y).toBeLessThanOrEqual(hi + 1e-6);
      }
    }
  });

  it('guarantees readable text at every focus', () => {
    for (const focus of [0, 0.5, 1]) {
      expect(contrast(WHITE_TEXT_LUMINANCE, luminanceBudget('dark', focus).hi)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(luminanceBudget('light', focus).lo, DARK_TEXT_LUMINANCE)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('background style', () => {
  it('accepts only known styles', () => {
    expect(isBackgroundStyle('mesh')).toBe(true);
    expect(isBackgroundStyle('artwork')).toBe(true);
    expect(isBackgroundStyle('julia')).toBe(false);
    expect(isBackgroundStyle(null)).toBe(false);
  });
});
