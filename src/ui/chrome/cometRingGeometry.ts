export interface RingGeometry {
  size: number;
  radius: number;
  strokeWidth: number;
}

export interface RoundedSquare {
  offset: number;
  side: number;
  radius: number;
}

export interface CometWedge {
  path: string;
  opacity: number;
}

const TAIL_START = 0;
const HEAD = 352;
const TAIL_CURVE = 1.4;
const WEDGE_DEGREES = 3;
const WEDGE_OVERLAP_DEGREES = 0.5;

function roundedSquarePath({ offset, side, radius }: RoundedSquare): string {
  const r = Math.max(0, Math.min(radius, side / 2));
  const far = offset + side;
  return (
    `M${offset + r} ${offset}H${far - r}A${r} ${r} 0 0 1 ${far} ${offset + r}V${far - r}` +
    `A${r} ${r} 0 0 1 ${far - r} ${far}H${offset + r}A${r} ${r} 0 0 1 ${offset} ${far - r}` +
    `V${offset + r}A${r} ${r} 0 0 1 ${offset + r} ${offset}Z`
  );
}

export function ringBandPath(outer: RoundedSquare, width: number): string {
  const inner = { offset: outer.offset + width, side: outer.side - width * 2, radius: outer.radius - width };
  return `${roundedSquarePath(outer)}${roundedSquarePath(inner)}`;
}

function cometProfile(degrees: number): number {
  if (degrees < TAIL_START) return 0;
  if (degrees < HEAD) return Math.pow((degrees - TAIL_START) / (HEAD - TAIL_START), TAIL_CURVE);
  return (360 - degrees) / (360 - HEAD);
}

function pointAt(center: number, reach: number, degrees: number): string {
  const angle = (degrees * Math.PI) / 180;
  return `${(center + reach * Math.sin(angle)).toFixed(2)} ${(center - reach * Math.cos(angle)).toFixed(2)}`;
}

export function cometWedges(center: number, reach: number): CometWedge[] {
  const wedges: CometWedge[] = [];
  for (let start = 0; start < 360; start += WEDGE_DEGREES) {
    const opacity = cometProfile(start + WEDGE_DEGREES / 2);
    if (opacity <= 0) continue;
    const end = start + WEDGE_DEGREES + WEDGE_OVERLAP_DEGREES;
    wedges.push({
      path: `M${center} ${center}L${pointAt(center, reach, start)}L${pointAt(center, reach, end)}Z`,
      opacity,
    });
  }
  return wedges;
}

export function rotationAbout(center: number, degrees: number): [number, number, number, number, number, number] {
  'worklet';
  const angle = (degrees * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [cos, sin, -sin, cos, center - cos * center + sin * center, center - sin * center - cos * center];
}
