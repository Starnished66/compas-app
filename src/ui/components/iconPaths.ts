export type IconPaint = 'stroke' | 'fill' | 'both';

export type IconElement =
  | { kind: 'path'; d: string; paint?: IconPaint; strokeWidth?: number }
  | { kind: 'circle'; cx: number; cy: number; r: number; paint?: IconPaint }
  | { kind: 'rect'; x: number; y: number; width: number; height: number; rx?: number; paint?: IconPaint };

export interface IconGlyph {
  elements: IconElement[];
  filledElements?: IconElement[];
  strokeWidth?: number;
}

export const ICON_VIEWBOX = 22;
export const ICON_STROKE_WIDTH = 1.7;

const stroke = (d: string): IconElement => ({ kind: 'path', d });
const fill = (d: string): IconElement => ({ kind: 'path', d, paint: 'fill' });
const strokeAndFill = (d: string): IconElement => ({ kind: 'path', d, paint: 'both' });
const lines = (d: string): IconGlyph => ({ elements: [stroke(d)] });

const HEART = 'M11 18s-6.5-4-6.5-8.5A3.5 3.5 0 0 1 11 7.2a3.5 3.5 0 0 1 6.5 2.3C17.5 14 11 18 11 18z';
const PLAY = 'M7.5 4.8v12.4a.6.6 0 0 0 .9.5l10-6.2a.6.6 0 0 0 0-1L8.4 4.3a.6.6 0 0 0-.9.5z';
const REPEAT = 'M4 10.5V9a3 3 0 0 1 3-3h11M15.5 3.5 18 6l-2.5 2.5M18 11.5V13a3 3 0 0 1-3 3H4M6.5 18.5 4 16l2.5-2.5';
const SHUFFLE =
  'M3.5 7h2.8c4.2 0 5.2 8 9.4 8h2.8M3.5 15h2.8c1.4 0 2.4-.9 3.3-2.2M12.4 9.2C13.3 7.9 14.3 7 15.7 7h2.8M16.5 5l2 2-2 2M16.5 13l2 2-2 2';
const GEAR =
  'M16.69 9.09L18.91 9.80L18.91 12.20L16.69 12.91L16.37 13.67L17.44 15.74L15.74 17.44L13.67 16.37L12.91 16.69L12.20 18.91L9.80 18.91L9.09 16.69L8.33 16.37L6.26 17.44L4.56 15.74L5.63 13.67L5.31 12.91L3.09 12.20L3.09 9.80L5.31 9.09L5.63 8.33L4.56 6.26L6.26 4.56L8.33 5.63L9.09 5.31L9.80 3.09L12.20 3.09L12.91 5.31L13.67 5.63L15.74 4.56L17.44 6.26L16.37 8.33Z';

export const iconGlyphs = {
  play: { elements: [fill(PLAY)] },
  pause: {
    elements: [
      { kind: 'rect', x: 6, y: 4.5, width: 3.6, height: 13, rx: 1.5, paint: 'fill' },
      { kind: 'rect', x: 12.4, y: 4.5, width: 3.6, height: 13, rx: 1.5, paint: 'fill' },
    ],
  },
  skipPrevious: {
    elements: [stroke('M5.5 5v12'), strokeAndFill('M17 5.6v10.8a.5.5 0 0 1-.8.4L8.6 11.4a.5.5 0 0 1 0-.8l7.6-5.4a.5.5 0 0 1 .8.4z')],
  },
  skipNext: {
    elements: [stroke('M16.5 5v12'), strokeAndFill('M5 5.6v10.8a.5.5 0 0 0 .8.4l7.6-5.4a.5.5 0 0 0 0-.8L5.8 5.2a.5.5 0 0 0-.8.4z')],
  },
  shuffle: lines(SHUFFLE),
  inOrder: lines('M3.5 7.5h15M16 5l2.5 2.5L16 10M3.5 14.5h15M16 12l2.5 2.5L16 17'),
  repeat: lines(REPEAT),
  repeatOne: { elements: [stroke(REPEAT), { kind: 'path', d: 'M9.9 10.1 11.2 9v4.6', strokeWidth: 1.5 }] },
  volume: { elements: [stroke('M4 9h3l4-3.5v11L7 13H4z'), stroke('M14.5 8.5a3.5 3.5 0 0 1 0 5M16.8 6.2a6.6 6.6 0 0 1 0 9.6')] },
  heart: { elements: [stroke(HEART)], filledElements: [strokeAndFill(HEART)] },
  chevronLeft: lines('M13.5 5 7.5 11l6 6'),
  chevronRight: lines('M9 5l6 6-6 6'),
  chevronDown: lines('M5 8.5l6 6 6-6'),
  chevronUp: lines('M5 13.5l6-6 6 6'),
  close: lines('M6.5 6.5l9 9M15.5 6.5l-9 9'),
  check: { elements: [stroke('M5 11.5l4 4 8-9')], strokeWidth: 2 },
  selectionCircle: { elements: [{ kind: 'circle', cx: 11, cy: 11, r: 7.5 }] },
  plus: { elements: [stroke('M11 5v12M5 11h12')], strokeWidth: 2 },
  minus: lines('M6 11h10'),
  removeCircle: { elements: [{ kind: 'circle', cx: 11, cy: 11, r: 7.5 }, stroke('M7.5 11h7')] },
  search: { elements: [{ kind: 'circle', cx: 10, cy: 10, r: 5.5 }, stroke('M14.2 14.2 18 18')] },
  settings: { elements: [stroke(GEAR), { kind: 'circle', cx: 11, cy: 11, r: 2.6 }] },
  sliders: lines('M4 6.5h7M15 6.5h3M4 15.5h3M11 15.5h7M13 4.5v4M9 13.5v4'),
  expand: lines('M12.5 4.5h5v5M17.5 4.5 12 10M9.5 17.5h-5v-5M4.5 17.5 10 12'),
  moreVertical: {
    elements: [
      { kind: 'circle', cx: 11, cy: 5.5, r: 1.4, paint: 'fill' },
      { kind: 'circle', cx: 11, cy: 11, r: 1.4, paint: 'fill' },
      { kind: 'circle', cx: 11, cy: 16.5, r: 1.4, paint: 'fill' },
    ],
  },
  moreHorizontal: lines('M5.5 11h.01M11 11h.01M16.5 11h.01'),
  dragHandle: lines('M5 8h12M5 11h12M5 14h12'),
  wifi: {
    elements: [
      stroke('M3.5 9a10.6 10.6 0 0 1 15 0M6.2 12a6.8 6.8 0 0 1 9.6 0M8.9 15a3 3 0 0 1 4.2 0'),
      { kind: 'circle', cx: 11, cy: 17.8, r: 0.9, paint: 'fill' },
    ],
  },
  bluetooth: lines('M7 7.5l8 7-4 3.5V4l4 3.5-8 7'),
  player: {
    elements: [{ kind: 'rect', x: 6, y: 3, width: 10, height: 16, rx: 2 }, { kind: 'circle', cx: 11, cy: 13, r: 2.5 }, stroke('M9.5 6.5h3')],
  },
  playerScreen: {
    elements: [{ kind: 'rect', x: 5.5, y: 3, width: 11, height: 16, rx: 2.4 }, stroke('M9.8 16h2.4')],
    filledElements: [
      { kind: 'rect', x: 5.5, y: 3, width: 11, height: 16, rx: 2.4 },
      { kind: 'rect', x: 7.6, y: 5.1, width: 6.8, height: 9, rx: 1, paint: 'fill' },
      stroke('M9.8 16h2.4'),
    ],
  },
  power: lines('M11 4v7M7 6.5a6 6 0 1 0 8 0'),
  key: { elements: [{ kind: 'circle', cx: 7.5, cy: 14.5, r: 3 }, stroke('M9.6 12.4 17 5M14.5 7.5l2 2')] },
  refresh: lines('M17.5 11a6.5 6.5 0 1 1-1.9-4.6M17.5 4v3.5H14'),
  sort: lines('M7 5v12M4 14l3 3 3-3M15 17V5M12 8l3-3 3 3'),
  grid: {
    elements: [
      { kind: 'rect', x: 4, y: 4, width: 6, height: 6, rx: 1.5 },
      { kind: 'rect', x: 12, y: 4, width: 6, height: 6, rx: 1.5 },
      { kind: 'rect', x: 4, y: 12, width: 6, height: 6, rx: 1.5 },
      { kind: 'rect', x: 12, y: 12, width: 6, height: 6, rx: 1.5 },
    ],
  },
  listView: lines('M4 6h14M4 11h14M4 16h14'),
  queue: { elements: [stroke('M4 6h14M4 11h14M4 16h8'), strokeAndFill('M15 14.5l4 2-4 2z')] },
  playlist: lines('M4 6h14M4 11h14M4 16h8'),
  queueAdd: lines('M4 6h14M4 11h14M4 16h7M15 14v6M12 17h6'),
  playlistAdd: lines('M4 6h14M4 11h9M4 16h6M16 12v7M12.5 15.5h7'),
  clock: { elements: [{ kind: 'circle', cx: 11, cy: 11, r: 7.5 }, stroke('M11 7v4l2.5 1.5')] },
  disc: { elements: [{ kind: 'circle', cx: 11, cy: 11, r: 7.5 }, { kind: 'circle', cx: 11, cy: 11, r: 2 }] },
  person: { elements: [{ kind: 'circle', cx: 11, cy: 8, r: 3.5 }, stroke('M4.5 18.5a6.5 6.5 0 0 1 13 0')] },
  folder: lines('M3.5 6.5a1 1 0 0 1 1-1h4l2 2h7a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1z'),
  genre: lines('M4 4h6.5l7.5 7.5-6.5 6.5L4 10.5zM7.5 7.5h.01'),
  music: {
    elements: [stroke('M9 16V5.5l8-1.5v10'), { kind: 'circle', cx: 7, cy: 16, r: 2 }, { kind: 'circle', cx: 15, cy: 14, r: 2 }],
  },
  file: lines('M6 3.5h6l4 4v11H6zM12 3.5v4h4'),
  sdCard: lines('M7 3.5h6l3 3v12H6v-14zM9 6.5v2M11.5 6.5v2'),
  arrowUp: lines('M11 17V5M6 10l5-5 5 5'),
  arrowDown: lines('M11 5v12M6 12l5 5 5-5'),
  import: lines('M11 4v10M7 10l4 4 4-4M5 17h12'),
  trash: lines('M5 7h12M9 7V5h4v2M7 7l1 11h6l1-11'),
  pencil: lines('M5 17l1-4 8-8 3 3-8 8z'),
  home: lines('M4 10 11 4l7 6v8h-4.5v-5h-5v5H4z'),
  library: lines('M5 4v14M9 4v14M13 5.5l4 12.5'),
} satisfies Record<string, IconGlyph>;

export type IconName = keyof typeof iconGlyphs;
