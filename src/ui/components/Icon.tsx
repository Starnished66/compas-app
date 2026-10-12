import React, { memo } from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { usePalette } from '../PaletteProvider';
import { ICON_STROKE_WIDTH, ICON_VIEWBOX, IconElement, IconGlyph, IconName, IconPaint, iconGlyphs } from './iconPaths';

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  filled?: boolean;
  strokeWidth?: number;
}

function IconContent({ name, size = 22, color, filled = false, strokeWidth }: IconProps) {
  const palette = usePalette();
  const glyph: IconGlyph = iconGlyphs[name];
  const tint = color ?? palette.ink;
  const elements = filled && glyph.filledElements ? glyph.filledElements : glyph.elements;
  const baseStrokeWidth = strokeWidth ?? glyph.strokeWidth ?? ICON_STROKE_WIDTH;

  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${ICON_VIEWBOX} ${ICON_VIEWBOX}`}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      {elements.map((element, index) => renderElement(element, index, tint, baseStrokeWidth))}
    </Svg>
  );
}

export const Icon = memo(IconContent);

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

function renderElement(element: IconElement, key: number, tint: string, strokeWidth: number) {
  const paint = element.paint ?? 'stroke';
  switch (element.kind) {
    case 'path':
      return <Path key={key} d={element.d} {...paintProps(paint, tint, element.strokeWidth ?? strokeWidth)} />;
    case 'circle':
      return <Circle key={key} cx={element.cx} cy={element.cy} r={element.r} {...paintProps(paint, tint, strokeWidth)} />;
    case 'rect':
      return (
        <Rect
          key={key}
          x={element.x}
          y={element.y}
          width={element.width}
          height={element.height}
          rx={element.rx}
          {...paintProps(paint, tint, strokeWidth)}
        />
      );
  }
}
