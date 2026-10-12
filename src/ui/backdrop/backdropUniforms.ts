import { AlbumPalette } from './albumPalette';
import { luminance, oklabToLinear, Vec3 } from './oklab';

export type BackdropTheme = 'dark' | 'light';

export interface LuminanceBudget {
  lo: number;
  hi: number;
  sat: number;
}

export interface UniformInputs {
  palette: AlbumPalette;
  seed: number;
  theme: BackdropTheme;
  focus: number;
  width: number;
  height: number;
}

export type BackdropUniforms = Record<string, number | number[]>;

export const PALETTE_SIZE = 5;
const SEED_BUCKETS = 1000;
const SEED_SPREAD = 159;

export function luminanceBudget(theme: BackdropTheme, focus: number): LuminanceBudget {
  const f = Math.max(0, Math.min(1, focus));
  return theme === 'light'
    ? { lo: 0.62 - 0.2 * f, hi: 0.93, sat: 0.4 + 0.6 * f }
    : { lo: 0.006, hi: 0.07 + 0.09 * f, sat: 0.4 + 0.6 * f };
}

export function fitLuminance(linear: Vec3, target: number): Vec3 {
  const current = luminance(linear);
  if (current > target) return linear.map((v) => v * (target / current)) as Vec3;
  const t = (target - current) / (1 - current);
  return linear.map((v) => v + (1 - v) * t) as Vec3;
}

export function tamePalette(palette: AlbumPalette, theme: BackdropTheme, focus: number): Vec3[] {
  const { lo, hi, sat } = luminanceBudget(theme, focus);
  const lightnessOrder = palette.map((color, i) => [color.lab[0], i] as const).sort((a, b) => a[0] - b[0]);
  const rank = new Array<number>(palette.length);
  lightnessOrder.forEach(([, i], r) => (rank[i] = palette.length > 1 ? r / (palette.length - 1) : 0.5));
  return palette.map((color, i) => {
    const t = 0.5 * rank[i] + 0.5 * Math.max(0, Math.min(1, color.lab[0]));
    const target = lo + (hi - lo) * (0.1 + 0.9 * t);
    return fitLuminance(oklabToLinear([Math.cbrt(target), color.lab[1] * sat, color.lab[2] * sat]), target);
  });
}

function padPalette(palette: AlbumPalette): AlbumPalette {
  const padded = palette.slice(0, PALETTE_SIZE);
  while (padded.length < PALETTE_SIZE) padded.push(padded[padded.length - 1]);
  return padded;
}

export function backdropUniforms({ palette, seed, theme, focus, width, height }: UniformInputs): BackdropUniforms {
  const padded = padPalette(palette);
  const tamed = tamePalette(padded, theme, focus);
  const ramp = [...tamed].sort((x, y) => luminance(x) - luminance(y));
  const { lo, hi } = luminanceBudget(theme, focus);
  const uniforms: BackdropUniforms = {
    uRes: [width, height],
    uLo: lo,
    uHi: hi,
    uSeed: ((seed >>> 0) % SEED_BUCKETS) / SEED_SPREAD,
  };
  for (let i = 0; i < PALETTE_SIZE; i++) {
    uniforms[`uPal${i}`] = tamed[i];
    uniforms[`uRamp${i}`] = ramp[i];
    uniforms[`uW${i}`] = padded[i].share;
  }
  return uniforms;
}

export function blendUniforms(from: BackdropUniforms, to: BackdropUniforms, progress: number): BackdropUniforms {
  'worklet';
  if (progress <= 0) return from;
  if (progress >= 1) return to;
  const eased = progress * progress * (3 - 2 * progress);
  const blended: BackdropUniforms = {};
  for (const name in to) {
    const start = from[name] ?? to[name];
    const end = to[name];
    blended[name] =
      typeof end === 'number'
        ? (start as number) + (end - (start as number)) * eased
        : end.map((value, i) => (start as number[])[i] + (value - (start as number[])[i]) * eased);
  }
  return blended;
}
