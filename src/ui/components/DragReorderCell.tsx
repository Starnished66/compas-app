import React, { ReactNode, memo, useContext, useMemo } from 'react';
import { Animated, StyleProp, ViewStyle } from 'react-native';
import { DragReorderCellContext } from './dragReorderCellContext';

export interface DragReorderCellProps {
  index: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

function DragReorderCellContent({ index, style, children, ...rest }: DragReorderCellProps) {
  const rowStyle = useContext(DragReorderCellContext);
  const shiftStyle = rowStyle?.(index);
  const cellStyle = useMemo(() => [style, shiftStyle], [style, shiftStyle]);
  return (
    <Animated.View {...rest} style={cellStyle}>
      {children}
    </Animated.View>
  );
}

export const DragReorderCell = memo(DragReorderCellContent);
