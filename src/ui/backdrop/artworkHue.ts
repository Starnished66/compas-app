import type { ArtworkPalette } from '../theme';

const HUE_BUCKETS = 12;
const BUCKET_DEGREES = 360 / HUE_BUCKETS;
const MIN_SATURATION = 0.16;
const MIN_BRIGHTNESS = 0.08;
const MAX_BRIGHTNESS = 0.96;
const MIN_ALPHA = 128;

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  const brightness = max / 255;
  const saturation = max === 0 ? 0 : delta / max;
  if (delta === 0) return [0, saturation, brightness];
  const sector = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return [(sector * 60 + 360) % 360, saturation, brightness];
}

export function dominantHue(rgba: ArrayLike<number>): ArtworkPalette | null {
  const weights = new Float64Array(HUE_BUCKETS);
  const hueX = new Float64Array(HUE_BUCKETS);
  const hueY = new Float64Array(HUE_BUCKETS);
  const saturations = new Float64Array(HUE_BUCKETS);

  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] < MIN_ALPHA) continue;
    const [hue, saturation, brightness] = rgbToHsv(rgba[i], rgba[i + 1], rgba[i + 2]);
    if (saturation < MIN_SATURATION || brightness < MIN_BRIGHTNESS || brightness > MAX_BRIGHTNESS) continue;
    const bucket = Math.min(HUE_BUCKETS - 1, Math.floor(hue / BUCKET_DEGREES));
    const weight = saturation * (1 - Math.abs(brightness - 0.55) * 0.35);
    const angle = (hue * Math.PI) / 180;
    weights[bucket] += weight;
    hueX[bucket] += Math.cos(angle) * weight;
    hueY[bucket] += Math.sin(angle) * weight;
    saturations[bucket] += saturation * weight;
  }

  let best = 0;
  for (let bucket = 1; bucket < HUE_BUCKETS; bucket++) if (weights[bucket] > weights[best]) best = bucket;
  if (weights[best] <= 0) return null;
  const hue = ((Math.atan2(hueY[best], hueX[best]) * 180) / Math.PI + 360) % 360;
  return { hue, saturation: Math.min(1, Math.max(0, saturations[best] / weights[best])) };
}
