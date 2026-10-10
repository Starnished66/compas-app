import React from 'react';
import { StyleSheet } from 'react-native';
import { Card, CardProps } from './Card';

export type CardSectionEdge = 'top' | 'middle' | 'bottom';

export interface CardSectionProps extends CardProps {
  edge: CardSectionEdge;
}

export function CardSection({ edge, style, ...rest }: CardSectionProps) {
  return <Card {...rest} style={[styles[edge], style]} />;
}

const styles = StyleSheet.create({
  top: {
    borderBottomWidth: 0,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  middle: {
    borderTopWidth: 0,
    borderBottomWidth: 0,
    borderRadius: 0,
  },
  bottom: {
    borderTopWidth: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
});
