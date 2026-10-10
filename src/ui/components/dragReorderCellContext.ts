import { createContext } from 'react';
import { Animated, ViewStyle } from 'react-native';

export type DragReorderRowStyle = (index: number) => Animated.WithAnimatedValue<ViewStyle>;

export const DragReorderCellContext = createContext<DragReorderRowStyle | null>(null);
