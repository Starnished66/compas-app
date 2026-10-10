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

export interface Perimeter {
  length: number;
  path: string;
  pointAt(fraction: number): Point;
}

interface PerimeterPiece {
  length: number;
  at(fraction: number): Point;
}

function line(from: Point, to: Point): PerimeterPiece {
  return {
    length: Math.hypot(to.x - from.x, to.y - from.y),
    at: (f) => ({ x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f }),
  };
}

function arc(center: Point, radius: number, startDegrees: number): PerimeterPiece {
  return {
    length: (Math.PI * radius) / 2,
    at: (f) => {
      const angle = ((startDegrees + 90 * f) * Math.PI) / 180;
      return { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) };
    },
  };
}

function wrap(value: number): number {
  return ((value % 1) + 1) % 1;
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
  const pointAt = (fraction: number): Point => {
    let distance = wrap(fraction) * length;
    for (const piece of pieces) {
      if (distance <= piece.length || piece === pieces[pieces.length - 1]) {
        return piece.at(piece.length > 0 ? Math.min(1, distance / piece.length) : 0);
      }
      distance -= piece.length;
    }
    return pieces[0].at(0);
  };
  const path =
    `M${mid} ${near}H${right - r}A${r} ${r} 0 0 1 ${right} ${near + r}V${bottom - r}` +
    `A${r} ${r} 0 0 1 ${right - r} ${bottom}H${near + r}A${r} ${r} 0 0 1 ${near} ${bottom - r}` +
    `V${near + r}A${r} ${r} 0 0 1 ${near + r} ${near}Z`;
  return { length, path, pointAt };
}
