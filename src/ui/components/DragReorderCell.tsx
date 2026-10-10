import React, { ReactNode, useContext } from 'react';
import { Animated, StyleProp, ViewStyle } from 'react-native';
import { DragReorderCellContext } from './dragReorderCellContext';

export interface DragReorderCellProps {
  index: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

export function DragReorderCell({ index, style, children, ...rest }: DragReorderCellProps) {
  const rowStyle = useContext(DragReorderCellContext);
  return (
    <Animated.View {...rest} style={[style, rowStyle?.(index)]}>
      {children}
    </Animated.View>
  );
}
