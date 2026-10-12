import { parseHexColor } from './theme';

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const RGBA_PATTERN = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i;

export function parseColor(color: string): Rgba | null {
  const trimmed = color.trim();
  if (/^#([0-9a-f]{6}|[0-9a-f]{8})$/i.test(trimmed)) return parseHexColor(trimmed);
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    const [r, g, b] = trimmed.slice(1).split('').map((digit) => parseInt(digit + digit, 16));
    return { r, g, b, a: 1 };
  }
  const match = RGBA_PATTERN.exec(trimmed);
  if (!match) return null;
  return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]), a: match[4] === undefined ? 1 : Number(match[4]) };
}
