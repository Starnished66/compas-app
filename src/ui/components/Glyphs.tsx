import React from 'react';
import Svg, { Path, Rect, Circle, Line } from 'react-native-svg';

export interface GlyphProps {
  name: string;
  size?: number;
  color?: string;
}

export const Glyph: React.FC<GlyphProps> = ({ name, size = 22, color = '#FFFFFF' }) => {
  const sw = 1.8;
  const s = size;

  switch (name) {
    case 'play':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <Path d="M7 4.5V19.5L19 12L7 4.5Z" fill={color} />
        </Svg>
      );

    case 'pause':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <Rect x="6" y="4.5" width="4" height="15" rx="1.5" fill={color} />
          <Rect x="14" y="4.5" width="4" height="15" rx="1.5" fill={color} />
        </Svg>
      );

    case 'previous':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <Rect x="4" y="5" width="2.5" height="14" rx="1" fill={color} />
          <Path d="M19 5.5L10 12L19 18.5V5.5Z" fill={color} />
        </Svg>
      );

    case 'next':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <Rect x="17.5" y="5" width="2.5" height="14" rx="1" fill={color} />
          <Path d="M5 5.5L14 12L5 18.5V5.5Z" fill={color} />
        </Svg>
      );

    case 'music':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <Line x1="14" y1="4" x2="14" y2="17" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Path d="M14 4L19 6V9" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
          <Circle cx="10" cy="17" r="3.5" stroke={color} strokeWidth={sw} />
        </Svg>
      );

    case 'library':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <Rect x="4" y="4" width="12" height="15" rx="2" stroke={color} strokeWidth={sw} />
          <Rect x="8" y="7" width="12" height="13" rx="2" stroke={color} strokeWidth={sw} />
          <Line x1="11" y1="11" x2="17" y2="11" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Line x1="11" y1="14" x2="15" y2="14" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );

    case 'more':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <Circle cx="5" cy="12" r="1.8" fill={color} />
          <Circle cx="12" cy="12" r="1.8" fill={color} />
          <Circle cx="19" cy="12" r="1.8" fill={color} />
        </Svg>
      );

    case 'moreVertical':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <Circle cx="12" cy="5" r="1.8" fill={color} />
          <Circle cx="12" cy="12" r="1.8" fill={color} />
          <Circle cx="12" cy="19" r="1.8" fill={color} />
        </Svg>
      );

    case 'grid':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <Rect x="4" y="4" width="6.5" height="6.5" rx="1.5" stroke={color} strokeWidth={sw} />
          <Rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" stroke={color} strokeWidth={sw} />
          <Rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" stroke={color} strokeWidth={sw} />
          <Rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" stroke={color} strokeWidth={sw} />
        </Svg>
      );

    case 'list':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <Line x1="5" y1="6" x2="19" y2="6" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Line x1="5" y1="12" x2="19" y2="12" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Line x1="5" y1="18" x2="14" y2="18" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );

    case 'filter':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <Line x1="4" y1="6" x2="20" y2="6" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Line x1="4" y1="12" x2="20" y2="12" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Line x1="4" y1="18" x2="20" y2="18" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Circle cx="8" cy="6" r="2.2" fill={color} />
          <Circle cx="16" cy="12" r="2.2" fill={color} />
          <Circle cx="10" cy="18" r="2.2" fill={color} />
        </Svg>
      );

    case 'sortUp':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <Line x1="6" y1="18" x2="6" y2="6" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Path d="M3 9L6 6L9 9" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
          <Line x1="13" y1="7" x2="20" y2="7" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Line x1="13" y1="12" x2="18" y2="12" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Line x1="13" y1="17" x2="16" y2="17" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );

    case 'sortDown':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <Line x1="6" y1="6" x2="6" y2="18" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Path d="M3 15L6 18L9 15" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
          <Line x1="13" y1="7" x2="16" y2="7" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Line x1="13" y1="12" x2="18" y2="12" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Line x1="13" y1="17" x2="20" y2="17" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );

    case 'shuffle':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <Path d="M4 6H8L16 18H20" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M17 15L20 18L17 21" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M4 18H8L10.5 14" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M13.5 10L16 6H20" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M17 3L20 6L17 9" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );

    case 'repeat':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <Path d="M6 8H18V12" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M15 5L18 8L15 11" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M18 16H6V12" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M9 19L6 16L9 13" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );

    case 'repeatone':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <Path d="M6 8H18V12" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M15 5L18 8L15 11" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M18 16H6V12" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M9 19L6 16L9 13" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
          <Line x1="12" y1="10" x2="12" y2="14" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );

    case 'volume':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <Path d="M4 10H7L12 6V18L7 14H4V10Z" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
          <Path d="M15 9C16.5 10.5 16.5 13.5 15 15" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Path d="M18 6C21 9 21 15 18 18" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );

    case 'home':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <Path d="M3 11L12 4L21 11V20H15V14H9V20H3V11Z" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );

    case 'back':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <Path d="M15 19L8 12L15 5" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );

    case 'search':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <Circle cx="10.5" cy="10.5" r="6.5" stroke={color} strokeWidth={sw} />
          <Line x1="15.5" y1="15.5" x2="20" y2="20" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );

    case 'device':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <Rect x="5" y="3" width="14" height="18" rx="2" stroke={color} strokeWidth={sw} />
          <Circle cx="12" cy="17" r="1.2" fill={color} />
          <Line x1="9" y1="7" x2="15" y2="7" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );

    case 'settings':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <Circle cx="12" cy="12" r="3" stroke={color} strokeWidth={sw} />
          <Path
            d="M12 2V4M12 20V22M4 12H2M22 12H20M6.3 6.3L4.9 4.9M19.1 19.1L17.7 17.7M6.3 17.7L4.9 19.1M19.1 4.9L17.7 6.3"
            stroke={color}
            strokeWidth={sw}
            strokeLinecap="round"
          />
        </Svg>
      );

    case 'refresh':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <Path d="M20 11A8 8 0 1 0 18.5 16.5" stroke={color} strokeWidth={sw} strokeLinecap="round" />
          <Path d="M20 4V11H13" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );

    case 'disc':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth={sw} />
          <Circle cx="12" cy="12" r="3" stroke={color} strokeWidth={sw} />
        </Svg>
      );

    case 'person':
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <Circle cx="12" cy="8" r="4" stroke={color} strokeWidth={sw} />
          <Path d="M4 20C4 16 7.5 14 12 14C16.5 14 20 16 20 20" stroke={color} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );

    default:
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <Circle cx="12" cy="12" r="8" stroke={color} strokeWidth={sw} />
        </Svg>
      );
  }
};
