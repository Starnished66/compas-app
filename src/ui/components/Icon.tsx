import React, { memo } from 'react';
import Svg, { Path } from 'react-native-svg';
import { usePalette } from '../PaletteProvider';
import { ICON_STROKE_WIDTH, ICON_VIEWBOX, IconElement, IconGlyph, IconName, IconPaint, iconGlyphs } from './iconPaths';

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  filled?: boolean;
  strokeWidth?: number;
}

interface MergedPath {
  d: string;
  paint: IconPaint;
  strokeWidth: number;
}

// Every SVG element is its own native view, and list rows mount icons while scrolling.
// Shapes that share paint are merged into one path, so an icon mounts at most a few views.
const mergedCache = new Map<string, MergedPath[]>();

function IconContent({ name, size = 22, color, filled = false, strokeWidth }: IconProps) {
  const palette = usePalette();
  const glyph: IconGlyph = iconGlyphs[name];
  const tint = color ?? palette.ink;
  const useFilled = filled && !!glyph.filledElements;
  const baseStrokeWidth = strokeWidth ?? glyph.strokeWidth ?? ICON_STROKE_WIDTH;
  const paths = mergedPaths(`${name}|${useFilled}|${baseStrokeWidth}`, useFilled ? glyph.filledElements! : glyph.elements, baseStrokeWidth);

  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${ICON_VIEWBOX} ${ICON_VIEWBOX}`}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      {paths.map((path, index) => (
        <Path key={index} d={path.d} {...paintProps(path.paint, tint, path.strokeWidth)} />
      ))}
    </Svg>
  );
}

export const Icon = memo(IconContent);

function mergedPaths(key: string, elements: IconElement[], baseStrokeWidth: number): MergedPath[] {
  const cached = mergedCache.get(key);
  if (cached) return cached;
  const groups = new Map<string, MergedPath>();
  for (const element of elements) {
    const paint = element.paint ?? 'stroke';
    const width = element.kind === 'path' ? element.strokeWidth ?? baseStrokeWidth : baseStrokeWidth;
    const groupKey = `${paint}|${width}`;
    const d = elementPath(element);
    const group = groups.get(groupKey);
    if (group) group.d += ` ${d}`;
    else groups.set(groupKey, { d, paint, strokeWidth: width });
  }
  const merged = [...groups.values()];
  mergedCache.set(key, merged);
  return merged;
}

function elementPath(element: IconElement): string {
  switch (element.kind) {
    case 'path':
      return element.d;
    case 'circle': {
      const { cx, cy, r } = element;
      return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
    }
    case 'rect': {
      const { x, y, width, height } = element;
      const rx = Math.min(element.rx ?? 0, width / 2, height / 2);
      if (!rx) return `M${x} ${y}h${width}v${height}h${-width}z`;
      return (
        `M${x + rx} ${y}h${width - 2 * rx}a${rx} ${rx} 0 0 1 ${rx} ${rx}v${height - 2 * rx}` +
        `a${rx} ${rx} 0 0 1 ${-rx} ${rx}h${-(width - 2 * rx)}a${rx} ${rx} 0 0 1 ${-rx} ${-rx}` +
        `v${-(height - 2 * rx)}a${rx} ${rx} 0 0 1 ${rx} ${-rx}z`
      );
    }
  }
}

function paintProps(paint: IconPaint, tint: string, strokeWidth: number) {
  const strokes = paint !== 'fill';
  return {
    fill: paint === 'stroke' ? 'none' : tint,
    stroke: strokes ? tint : 'none',
    strokeWidth: strokes ? strokeWidth : 0,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
}
