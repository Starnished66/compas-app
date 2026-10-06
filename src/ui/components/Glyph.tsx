import React from 'react';
import Svg, { Path, Rect, Circle, Line } from 'react-native-svg';

export interface GlyphProps {
  name: string;
  size?: number;
  tint?: string;
}

export const Glyph: React.FC<GlyphProps> = ({ name, size = 22, tint = '#FFFFFF' }) => {
  const w = size;
  const h = size;
  const strokeWidth = 1.7;

  switch (name) {
    case 'heart':
    case 'heartFill':
      return (
        <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <Path
            d={`M ${w * 0.5} ${h * 0.85} C ${w * 0.37} ${h * 0.72}, ${w * 0.12} ${h * 0.56}, ${w * 0.12} ${h * 0.36} C ${w * 0.12} ${h * 0.16}, ${w * 0.37} ${h * 0.11}, ${w * 0.5} ${h * 0.3} C ${w * 0.63} ${h * 0.11}, ${w * 0.88} ${h * 0.16}, ${w * 0.88} ${h * 0.36} C ${w * 0.88} ${h * 0.56}, ${w * 0.63} ${h * 0.72}, ${w * 0.5} ${h * 0.85} Z`}
            stroke={tint}
            strokeWidth={strokeWidth}
            fill={name === 'heartFill' ? tint : 'none'}
          />
        </Svg>
      );
    case 'play':
      return (
        <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <Path
            d={`M ${w * 0.32} ${h * 0.2} L ${w * 0.78} ${h * 0.5} L ${w * 0.32} ${h * 0.8} Z`}
            fill={tint}
          />
        </Svg>
      );

    case 'pause':
      return (
        <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <Rect
            x={w * 0.27}
            y={h * 0.2}
            width={w * 0.17}
            height={h * 0.6}
            rx={2}
            fill={tint}
          />
          <Rect
            x={w * 0.57}
            y={h * 0.2}
            width={w * 0.17}
            height={h * 0.6}
            rx={2}
            fill={tint}
          />
        </Svg>
      );

    case 'previous':
      return (
        <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <Rect
            x={w * 0.21}
            y={h * 0.2}
            width={w * 0.09}
            height={h * 0.6}
            rx={w * 0.03}
            fill={tint}
          />
          <Path
            d={`M ${w * 0.72} ${h * 0.22} L ${w * 0.38} ${h * 0.5} L ${w * 0.72} ${h * 0.78} Z`}
            fill={tint}
          />
        </Svg>
      );

    case 'next':
      return (
        <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <Rect
            x={w * 0.7}
            y={h * 0.2}
            width={w * 0.09}
            height={h * 0.6}
            rx={w * 0.03}
            fill={tint}
          />
          <Path
            d={`M ${w * 0.28} ${h * 0.22} L ${w * 0.62} ${h * 0.5} L ${w * 0.28} ${h * 0.78} Z`}
            fill={tint}
          />
        </Svg>
      );

    case 'music':
      return (
        <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <Line x1={w * 0.58} y1={h * 0.18} x2={w * 0.58} y2={h * 0.7} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.58} y1={h * 0.18} x2={w * 0.8} y2={h * 0.28} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.8} y1={h * 0.28} x2={w * 0.8} y2={h * 0.42} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Circle cx={w * 0.44} cy={h * 0.7} r={w * 0.14} stroke={tint} strokeWidth={strokeWidth} fill="none" />
        </Svg>
      );

    case 'library':
      return (
        <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <Rect
            x={w * 0.2}
            y={h * 0.18}
            width={w * 0.52}
            height={h * 0.64}
            rx={w * 0.06}
            stroke={tint}
            strokeWidth={strokeWidth}
            fill="none"
          />
          <Rect
            x={w * 0.34}
            y={h * 0.27}
            width={w * 0.52}
            height={h * 0.58}
            rx={w * 0.06}
            stroke={tint}
            strokeWidth={strokeWidth}
            fill="none"
          />
          <Line x1={w * 0.47} y1={h * 0.47} x2={w * 0.72} y2={h * 0.47} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.47} y1={h * 0.62} x2={w * 0.68} y2={h * 0.62} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
        </Svg>
      );

    case 'more':
      return (
        <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <Circle cx={w * 0.2} cy={h * 0.5} r={w * 0.07} fill={tint} />
          <Circle cx={w * 0.5} cy={h * 0.5} r={w * 0.07} fill={tint} />
          <Circle cx={w * 0.8} cy={h * 0.5} r={w * 0.07} fill={tint} />
        </Svg>
      );

    case 'moreVertical':
      return (
        <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <Circle cx={w * 0.5} cy={h * 0.2} r={w * 0.07} fill={tint} />
          <Circle cx={w * 0.5} cy={h * 0.5} r={w * 0.07} fill={tint} />
          <Circle cx={w * 0.5} cy={h * 0.8} r={w * 0.07} fill={tint} />
        </Svg>
      );

    case 'grid':
      return (
        <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <Rect x={w * 0.18} y={h * 0.18} width={w * 0.27} height={h * 0.27} rx={w * 0.04} fill={tint} />
          <Rect x={w * 0.55} y={h * 0.18} width={w * 0.27} height={h * 0.27} rx={w * 0.04} fill={tint} />
          <Rect x={w * 0.18} y={h * 0.55} width={w * 0.27} height={h * 0.27} rx={w * 0.04} fill={tint} />
          <Rect x={w * 0.55} y={h * 0.55} width={w * 0.27} height={h * 0.27} rx={w * 0.04} fill={tint} />
        </Svg>
      );

    case 'filter':
      return (
        <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <Line x1={w * 0.18} y1={h * 0.25} x2={w * 0.82} y2={h * 0.25} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.18} y1={h * 0.5} x2={w * 0.82} y2={h * 0.5} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.18} y1={h * 0.75} x2={w * 0.82} y2={h * 0.75} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Circle cx={w * 0.38} cy={h * 0.25} r={w * 0.09} fill={tint} />
          <Circle cx={w * 0.66} cy={h * 0.5} r={w * 0.09} fill={tint} />
          <Circle cx={w * 0.46} cy={h * 0.75} r={w * 0.09} fill={tint} />
        </Svg>
      );

    case 'sortUp':
      return (
        <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <Line x1={w * 0.25} y1={h * 0.76} x2={w * 0.25} y2={h * 0.27} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.25} y1={h * 0.27} x2={w * 0.13} y2={h * 0.4} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.25} y1={h * 0.27} x2={w * 0.37} y2={h * 0.4} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.54} y1={h * 0.3} x2={w * 0.84} y2={h * 0.3} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.54} y1={h * 0.5} x2={w * 0.78} y2={h * 0.5} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.54} y1={h * 0.7} x2={w * 0.72} y2={h * 0.7} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
        </Svg>
      );

    case 'sortDown':
      return (
        <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <Line x1={w * 0.25} y1={h * 0.24} x2={w * 0.25} y2={h * 0.73} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.25} y1={h * 0.73} x2={w * 0.13} y2={h * 0.6} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.25} y1={h * 0.73} x2={w * 0.37} y2={h * 0.6} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.54} y1={h * 0.3} x2={w * 0.72} y2={h * 0.3} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.54} y1={h * 0.5} x2={w * 0.78} y2={h * 0.5} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.54} y1={h * 0.7} x2={w * 0.84} y2={h * 0.7} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
        </Svg>
      );

    case 'check':
      return (
        <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <Line x1={w * 0.2} y1={h * 0.53} x2={w * 0.42} y2={h * 0.74} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.42} y1={h * 0.74} x2={w * 0.81} y2={h * 0.27} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
        </Svg>
      );

    case 'settings':
      return (
        <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <Circle cx={w * 0.5} cy={h * 0.5} r={w * 0.105} stroke={tint} strokeWidth={strokeWidth} fill="none" />
          <Circle cx={w * 0.5} cy={h * 0.5} r={w * 0.35} stroke={tint} strokeWidth={strokeWidth} fill="none" strokeDasharray="3 3" />
        </Svg>
      );

    case 'shuffle':
      return (
        <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <Line x1={w * 0.18} y1={h * 0.28} x2={w * 0.34} y2={h * 0.28} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.34} y1={h * 0.28} x2={w * 0.66} y2={h * 0.72} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.66} y1={h * 0.72} x2={w * 0.82} y2={h * 0.72} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.72} y1={h * 0.62} x2={w * 0.82} y2={h * 0.72} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.72} y1={h * 0.82} x2={w * 0.82} y2={h * 0.72} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.18} y1={h * 0.72} x2={w * 0.34} y2={h * 0.72} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.34} y1={h * 0.72} x2={w * 0.48} y2={h * 0.52} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.58} y1={h * 0.38} x2={w * 0.66} y2={h * 0.28} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.66} y1={h * 0.28} x2={w * 0.82} y2={h * 0.28} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.72} y1={h * 0.18} x2={w * 0.82} y2={h * 0.28} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.72} y1={h * 0.38} x2={w * 0.82} y2={h * 0.28} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
        </Svg>
      );

    case 'sequence':
      return (
        <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <Line x1={w * 0.2} y1={h * 0.25} x2={w * 0.8} y2={h * 0.25} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.2} y1={h * 0.5} x2={w * 0.8} y2={h * 0.5} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.2} y1={h * 0.75} x2={w * 0.8} y2={h * 0.75} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Circle cx={w * 0.31} cy={h * 0.25} r={w * 0.05} fill={tint} />
          <Circle cx={w * 0.62} cy={h * 0.5} r={w * 0.05} fill={tint} />
          <Circle cx={w * 0.44} cy={h * 0.75} r={w * 0.05} fill={tint} />
        </Svg>
      );

    case 'person':
      return (
        <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <Circle cx={w * 0.5} cy={h * 0.32} r={w * 0.2} stroke={tint} strokeWidth={strokeWidth} fill="none" />
          <Path
            d={`M ${w * 0.15} ${h * 0.78} A ${w * 0.35} ${h * 0.3} 0 0 1 ${w * 0.85} ${h * 0.78}`}
            stroke={tint}
            strokeWidth={strokeWidth}
            fill="none"
          />
        </Svg>
      );

    case 'refresh':
      return (
        <Svg width={w} height={h} viewBox="0 0 24 24">
          <Path
            d="M3 11a9 9 0 0 1 15.36-6.36L21 8M21 3v5h-5M21 13a9 9 0 0 1-15.36 6.36L3 16M3 21v-5h5"
            stroke={tint}
            strokeWidth={2}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      );

    case 'disc':
      return (
        <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <Circle cx={w * 0.5} cy={h * 0.5} r={w * 0.43} stroke={tint} strokeWidth={strokeWidth} fill="none" />
          <Circle cx={w * 0.5} cy={h * 0.5} r={w * 0.23} stroke={tint} strokeWidth={strokeWidth} fill="none" />
          <Circle cx={w * 0.5} cy={h * 0.5} r={w * 0.045} fill={tint} />
        </Svg>
      );

    case 'list':
      return (
        <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <Line x1={w * 0.2} y1={h * 0.27} x2={w * 0.8} y2={h * 0.27} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.2} y1={h * 0.5} x2={w * 0.8} y2={h * 0.5} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.2} y1={h * 0.73} x2={w * 0.58} y2={h * 0.73} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Circle cx={w * 0.77} cy={h * 0.73} r={w * 0.08} stroke={tint} strokeWidth={strokeWidth} fill="none" />
        </Svg>
      );

    case 'volume':
      return (
        <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <Line x1={w * 0.16} y1={h * 0.4} x2={w * 0.32} y2={h * 0.4} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.32} y1={h * 0.4} x2={w * 0.53} y2={h * 0.22} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.53} y1={h * 0.22} x2={w * 0.53} y2={h * 0.78} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.53} y1={h * 0.78} x2={w * 0.32} y2={h * 0.6} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.32} y1={h * 0.6} x2={w * 0.16} y2={h * 0.6} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.68} y1={h * 0.36} x2={w * 0.79} y2={h * 0.5} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.79} y1={h * 0.5} x2={w * 0.68} y2={h * 0.64} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
        </Svg>
      );

    case 'repeat':
      return (
        <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <Line x1={w * 0.24} y1={h * 0.33} x2={w * 0.7} y2={h * 0.33} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.7} y1={h * 0.33} x2={w * 0.6} y2={h * 0.23} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.7} y1={h * 0.33} x2={w * 0.6} y2={h * 0.43} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.76} y1={h * 0.67} x2={w * 0.3} y2={h * 0.67} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.3} y1={h * 0.67} x2={w * 0.4} y2={h * 0.57} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.3} y1={h * 0.67} x2={w * 0.4} y2={h * 0.77} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.22} y1={h * 0.34} x2={w * 0.22} y2={h * 0.48} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.78} y1={h * 0.52} x2={w * 0.78} y2={h * 0.66} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
        </Svg>
      );

    case 'repeatone':
      return (
        <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <Line x1={w * 0.24} y1={h * 0.33} x2={w * 0.7} y2={h * 0.33} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.7} y1={h * 0.33} x2={w * 0.6} y2={h * 0.23} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.7} y1={h * 0.33} x2={w * 0.6} y2={h * 0.43} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.76} y1={h * 0.67} x2={w * 0.3} y2={h * 0.67} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.3} y1={h * 0.67} x2={w * 0.4} y2={h * 0.57} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.3} y1={h * 0.67} x2={w * 0.4} y2={h * 0.77} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.22} y1={h * 0.34} x2={w * 0.22} y2={h * 0.48} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.78} y1={h * 0.52} x2={w * 0.78} y2={h * 0.66} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.5} y1={h * 0.4} x2={w * 0.5} y2={h * 0.61} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.45} y1={h * 0.44} x2={w * 0.5} y2={h * 0.4} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
        </Svg>
      );

    case 'back':
      return (
        <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <Line x1={w * 0.67} y1={h * 0.2} x2={w * 0.37} y2={h * 0.5} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.37} y1={h * 0.5} x2={w * 0.67} y2={h * 0.8} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
        </Svg>
      );

    case 'home':
      return (
        <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <Line x1={w * 0.12} y1={h * 0.47} x2={w * 0.5} y2={h * 0.14} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.5} y1={h * 0.14} x2={w * 0.88} y2={h * 0.47} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.25} y1={h * 0.43} x2={w * 0.25} y2={h * 0.86} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.75} y1={h * 0.43} x2={w * 0.75} y2={h * 0.86} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.25} y1={h * 0.86} x2={w * 0.75} y2={h * 0.86} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.43} y1={h * 0.86} x2={w * 0.43} y2={h * 0.6} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.43} y1={h * 0.6} x2={w * 0.57} y2={h * 0.6} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.57} y1={h * 0.6} x2={w * 0.57} y2={h * 0.86} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
        </Svg>
      );

    case 'search':
      return (
        <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <Circle cx={w * 0.43} cy={h * 0.43} r={w * 0.27} stroke={tint} strokeWidth={strokeWidth} fill="none" />
          <Line x1={w * 0.63} y1={h * 0.63} x2={w * 0.86} y2={h * 0.86} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
        </Svg>
      );

    case 'device':
      return (
        <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <Rect
            x={w * 0.22}
            y={h * 0.13}
            width={w * 0.56}
            height={h * 0.74}
            rx={w * 0.08}
            stroke={tint}
            strokeWidth={strokeWidth}
            fill="none"
          />
          <Line x1={w * 0.42} y1={h * 0.75} x2={w * 0.58} y2={h * 0.75} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
        </Svg>
      );

    case 'sun':
      return (
        <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <Circle cx={w * 0.5} cy={h * 0.5} r={w * 0.22} stroke={tint} strokeWidth={strokeWidth} fill="none" />
          <Line x1={w * 0.5} y1={h * 0.04} x2={w * 0.5} y2={h * 0.18} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.5} y1={h * 0.82} x2={w * 0.5} y2={h * 0.96} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.04} y1={h * 0.5} x2={w * 0.18} y2={h * 0.5} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.82} y1={h * 0.5} x2={w * 0.96} y2={h * 0.5} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.18} y1={h * 0.18} x2={w * 0.28} y2={h * 0.28} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.72} y1={h * 0.72} x2={w * 0.82} y2={h * 0.82} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.18} y1={h * 0.82} x2={w * 0.28} y2={h * 0.72} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Line x1={w * 0.72} y1={h * 0.28} x2={w * 0.82} y2={h * 0.18} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" />
        </Svg>
      );

    case 'moon':
      return (
        <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <Path
            d={`M ${w * 0.5} ${h * 0.15} A ${w * 0.35} ${h * 0.35} 0 1 0 ${w * 0.85} ${h * 0.65} A ${w * 0.32} ${h * 0.32} 0 0 1 ${w * 0.5} ${h * 0.15} Z`}
            stroke={tint}
            strokeWidth={1.8}
            fill="none"
          />
        </Svg>
      );

    default:
      return (
        <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <Circle cx={w * 0.5} cy={h * 0.5} r={w * 0.32} stroke={tint} strokeWidth={strokeWidth} fill="none" />
        </Svg>
      );
  }
};
