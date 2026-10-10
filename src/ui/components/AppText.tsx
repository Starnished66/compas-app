import React from 'react';
import { Text, TextProps } from 'react-native';
import { Palette } from '../palette';
import { usePalette } from '../PaletteProvider';
import { TabularNumbers, Type, TypeVariant } from '../tokens';

export type TextTone = 'ink' | 'inkMuted' | 'accent' | 'onAccent' | 'onAccentContainer' | 'statusError';

export interface AppTextProps extends TextProps {
  variant?: TypeVariant;
  tone?: TextTone;
  tabular?: boolean;
}

export function toneColor(palette: Palette, tone: TextTone): string {
  return palette[tone];
}

export function AppText({ variant = 'body', tone = 'ink', tabular, style, ...rest }: AppTextProps) {
  const palette = usePalette();
  return (
    <Text
      {...rest}
      style={[Type[variant], { color: toneColor(palette, tone) }, tabular && TabularNumbers, style]}
    />
  );
}
