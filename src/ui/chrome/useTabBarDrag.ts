import { RefObject, useRef } from 'react';
import { GestureResponderHandlers, PanResponder, View } from 'react-native';
import { Distances } from '../motion';
import { TabBarMotion } from './useTabBarMotion';

export interface TabBarDragOptions {
  rowRef: RefObject<View | null>;
  tabCount: number;
  tabWidth: number;
  enabled: boolean;
  motion: TabBarMotion;
  onDrop(index: number): void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export interface TabBarDrag {
  panHandlers: GestureResponderHandlers;
  measureRow(): void;
}

export function useTabBarDrag(options: TabBarDragOptions): TabBarDrag {
  const latest = useRef(options);
  latest.current = options;
  const rowLeft = useRef(0);
  const current = useRef(0);

  const measureRow = () =>
    latest.current.rowRef.current?.measureInWindow((x) => {
      rowLeft.current = x;
    });

  const slotAt = (pageX: number) => {
    const { tabWidth, tabCount } = latest.current;
    if (tabWidth <= 0) return current.current;
    const left = clamp(pageX - rowLeft.current - tabWidth / 2, 0, tabWidth * (tabCount - 1));
    return left / tabWidth;
  };

  const release = () => {
    const { tabCount, motion, onDrop } = latest.current;
    const index = clamp(Math.round(current.current), 0, tabCount - 1);
    motion.endDrag(index);
    onDrop(index);
  };

  const responder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, gesture) =>
        latest.current.enabled &&
        latest.current.tabWidth > 0 &&
        Math.abs(gesture.dx) >= Distances.tapSlop &&
        Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderGrant: (_, gesture) => {
        measureRow();
        latest.current.motion.beginDrag();
        current.current = slotAt(gesture.moveX);
        latest.current.motion.dragTo(current.current);
      },
      onPanResponderMove: (_, gesture) => {
        current.current = slotAt(gesture.moveX);
        latest.current.motion.dragTo(current.current);
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: release,
      onPanResponderTerminate: release,
    }),
  ).current;

  return { panHandlers: responder.panHandlers, measureRow };
}
