export interface RoundedRect {
  width: number;
  height: number;
  radius: number;
  strokeWidth: number;
}

export interface Point {
  x: number;
  y: number;
}

type PerimeterPiece =
  | { kind: 'line'; length: number; from: Point; to: Point }
  | { kind: 'arc'; length: number; center: Point; radius: number; startDegrees: number };

export interface Perimeter {
  length: number;
  path: string;
  pieces: PerimeterPiece[];
}

function line(from: Point, to: Point): PerimeterPiece {
  return { kind: 'line', length: Math.hypot(to.x - from.x, to.y - from.y), from, to };
}

function arc(center: Point, radius: number, startDegrees: number): PerimeterPiece {
  return { kind: 'arc', length: (Math.PI * radius) / 2, center, radius, startDegrees };
}

export function wrapFraction(value: number): number {
  'worklet';
  return ((value % 1) + 1) % 1;
}

function pointOnPiece(piece: PerimeterPiece, fraction: number): Point {
  'worklet';
  if (piece.kind === 'line') {
    return {
      x: piece.from.x + (piece.to.x - piece.from.x) * fraction,
      y: piece.from.y + (piece.to.y - piece.from.y) * fraction,
    };
  }
  const angle = ((piece.startDegrees + 90 * fraction) * Math.PI) / 180;
  return { x: piece.center.x + piece.radius * Math.cos(angle), y: piece.center.y + piece.radius * Math.sin(angle) };
}

export function pointOnPerimeter({ length, pieces }: Perimeter, fraction: number): Point {
  'worklet';
  let distance = wrapFraction(fraction) * length;
  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i];
    if (distance <= piece.length || i === pieces.length - 1) {
      return pointOnPiece(piece, piece.length > 0 ? Math.min(1, distance / piece.length) : 0);
    }
    distance -= piece.length;
  }
  return pointOnPiece(pieces[0], 0);
}

export function roundedRectPerimeter({ width, height, radius, strokeWidth }: RoundedRect): Perimeter {
  const near = strokeWidth / 2;
  const right = width - near;
  const bottom = height - near;
  const r = Math.max(0, Math.min(radius - near, (width - strokeWidth) / 2, (height - strokeWidth) / 2));
  const mid = width / 2;
  const pieces = [
    line({ x: mid, y: near }, { x: right - r, y: near }),
    arc({ x: right - r, y: near + r }, r, -90),
    line({ x: right, y: near + r }, { x: right, y: bottom - r }),
    arc({ x: right - r, y: bottom - r }, r, 0),
    line({ x: right - r, y: bottom }, { x: near + r, y: bottom }),
    arc({ x: near + r, y: bottom - r }, r, 90),
    line({ x: near, y: bottom - r }, { x: near, y: near + r }),
    arc({ x: near + r, y: near + r }, r, 180),
    line({ x: near + r, y: near }, { x: mid, y: near }),
  ];
  const length = pieces.reduce((sum, piece) => sum + piece.length, 0);
  const path =
    `M${mid} ${near}H${right - r}A${r} ${r} 0 0 1 ${right} ${near + r}V${bottom - r}` +
    `A${r} ${r} 0 0 1 ${right - r} ${bottom}H${near + r}A${r} ${r} 0 0 1 ${near} ${bottom - r}` +
    `V${near + r}A${r} ${r} 0 0 1 ${near + r} ${near}Z`;
  return { length, path, pieces };
}
