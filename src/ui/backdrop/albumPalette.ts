import { rgbToOklab, Vec3 } from './oklab';

export interface AlbumColor {
  lab: Vec3;
  share: number;
}

export type AlbumPalette = ReadonlyArray<AlbumColor>;

export interface PaletteExtractionOptions {
  k?: number;
  seed?: number;
  iterations?: number;
}

const OPAQUE_ALPHA = 128;
const EMPTY_COVER_COLOR: Vec3 = [0.3, 0, 0];

const SEED_SAMPLE_LENGTH = 1024;

// Artwork can arrive as a base64 data URI of up to megabytes; hashing all of it
// stalls the JS thread on every album change, and an even sample identifies it as well.
export function identitySample(value: string): string {
  if (value.length <= SEED_SAMPLE_LENGTH) return value;
  const stride = value.length / SEED_SAMPLE_LENGTH;
  let sample = `${value.length}:`;
  for (let i = 0; i < SEED_SAMPLE_LENGTH; i++) sample += value[Math.floor(i * stride)];
  return sample;
}

export function seedFromString(value: string): number {
  const bytes = new TextEncoder().encode(identitySample(value));
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const squaredDistance = (p: Vec3, q: Vec3) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;

function opaquePixelsAsOklab(rgba: ArrayLike<number>): Vec3[] {
  const points: Vec3[] = [];
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] > OPAQUE_ALPHA) points.push(rgbToOklab(rgba[i], rgba[i + 1], rgba[i + 2]));
  }
  return points.length ? points : [EMPTY_COVER_COLOR];
}

function kMeansPlusPlusCenters(points: Vec3[], k: number, random: () => number): Vec3[] {
  const centers: Vec3[] = [[...points[Math.floor(random() * points.length)]]];
  while (centers.length < k) {
    const distances = points.map((p) => Math.min(...centers.map((q) => squaredDistance(p, q))));
    let remaining = random() * distances.reduce((a, b) => a + b, 0);
    let index = 0;
    while (index < distances.length - 1 && (remaining -= distances[index]) > 0) index++;
    centers.push([...points[index]]);
  }
  return centers;
}

function nearestCenter(point: Vec3, centers: Vec3[]): number {
  let best = 0;
  let bestDistance = Infinity;
  for (let j = 0; j < centers.length; j++) {
    const distance = squaredDistance(point, centers[j]);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = j;
    }
  }
  return best;
}

export function extractPalette(
  rgba: ArrayLike<number>,
  { k = 5, seed = 1, iterations = 14 }: PaletteExtractionOptions = {},
): AlbumColor[] {
  const points = opaquePixelsAsOklab(rgba);
  const centers = kMeansPlusPlusCenters(points, k, mulberry32(seed));
  const assignment = new Int32Array(points.length);
  for (let iteration = 0; iteration < iterations; iteration++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    points.forEach((point, i) => {
      assignment[i] = nearestCenter(point, centers);
      const sum = sums[assignment[i]];
      sum[0] += point[0];
      sum[1] += point[1];
      sum[2] += point[2];
      sum[3]++;
    });
    sums.forEach((sum, j) => {
      if (sum[3]) centers[j] = [sum[0] / sum[3], sum[1] / sum[3], sum[2] / sum[3]];
    });
  }
  const counts = new Array<number>(k).fill(0);
  assignment.forEach((center) => counts[center]++);
  return centers
    .map((lab, j) => ({ lab, share: counts[j] / points.length }))
    .sort((a, b) => b.share - a.share);
}

const ACCENT_STEPS = [
  { lightness: 1, share: 0.5 },
  { lightness: 0.75, share: 0.3 },
  { lightness: 0.5, share: 0.2 },
];
const ACCENT_MIN_CHROMA = 0.14;

export function accentPalette([L, a, b]: Vec3): AlbumColor[] {
  const chroma = Math.hypot(a, b);
  const boost = chroma > 0 ? Math.max(1, ACCENT_MIN_CHROMA / chroma) : 0;
  return ACCENT_STEPS.map(({ lightness, share }) => ({ lab: [L * lightness, a * boost, b * boost], share }));
}
