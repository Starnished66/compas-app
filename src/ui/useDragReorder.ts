import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityActionEvent,
  AccessibilityActionInfo,
  AccessibilityRole,
  Animated,
  GestureResponderHandlers,
  PanResponder,
  PanResponderInstance,
  ViewStyle,
} from 'react-native';
import { Durations, Easings, motionDuration } from './motion';
import { useReducedMotion } from './useReducedMotion';

export interface DragReorderOptions {
  itemCount: number;
  rowHeight: number;
  enabled: boolean;
  minIndex?: number;
  maxIndex?: number;
  onMove(from: number, to: number): void;
  onDragStateChange?(active: boolean): void;
}

export interface DragHandleProps extends GestureResponderHandlers {
  accessible: boolean;
  accessibilityRole: AccessibilityRole;
  accessibilityLabel: string;
  accessibilityHint: string;
  accessibilityActions: AccessibilityActionInfo[];
  onAccessibilityAction(event: AccessibilityActionEvent): void;
}

export interface DragReorder {
  rowStyle(index: number): Animated.WithAnimatedValue<ViewStyle>;
  handleProps(index: number): DragHandleProps;
  draggingIndex: number | null;
  scrollEnabled: boolean;
}

const LIFT_SCALE = 1.03;
const LIFTED_Z_INDEX = 10;
const LIFTED_ELEVATION = 12;
const LIFTED_SHADOW = {
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 10 },
  shadowOpacity: 0.32,
  shadowRadius: 14,
} as const;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function useDragReorder(options: DragReorderOptions): DragReorder {
  const reducedMotion = useReducedMotion();
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const shifts = useRef<Animated.Value[]>([]).current;
  const dragY = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(1)).current;
  const responders = useRef(new Map<number, PanResponderInstance>()).current;
  const handles = useRef(new Map<number, { min: number; max: number; props: DragHandleProps }>()).current;
  const drag = useRef({ from: -1, target: -1 });
  const latest = useRef({ ...options, reducedMotion });
  latest.current = { ...options, reducedMotion };

  while (shifts.length < options.itemCount) shifts.push(new Animated.Value(0));

  const bounds = () => {
    const { minIndex = 0, maxIndex, itemCount } = latest.current;
    return { min: minIndex, max: Math.min(maxIndex ?? itemCount - 1, itemCount - 1) };
  };

  const shiftFor = (index: number, from: number, target: number, rowHeight: number) => {
    if (index === from) return 0;
    if (from < index && index <= target) return -rowHeight;
    if (target <= index && index < from) return rowHeight;
    return 0;
  };

  const applyTarget = (target: number) => {
    const { from } = drag.current;
    if (target === drag.current.target) return;
    drag.current.target = target;
    const { rowHeight } = latest.current;
    const { min, max } = bounds();
    for (let index = min; index <= max; index += 1) {
      const value = shifts[index];
      if (!value) continue;
      Animated.timing(value, {
        toValue: shiftFor(index, from, target, rowHeight),
        duration: motionDuration(latest.current.reducedMotion, Durations.rowShift),
        easing: Easings.standard,
        useNativeDriver: true,
      }).start();
    }
  };

  const resetPositions = () => {
    shifts.forEach((value) => value.setValue(0));
    dragY.setValue(0);
    lift.setValue(1);
  };

  const begin = (index: number) => {
    drag.current = { from: index, target: index };
    dragY.setValue(0);
    setDraggingIndex(index);
    latest.current.onDragStateChange?.(true);
    Animated.timing(lift, {
      toValue: LIFT_SCALE,
      duration: motionDuration(latest.current.reducedMotion, Durations.rowShift),
      easing: Easings.standard,
      useNativeDriver: true,
    }).start();
  };

  const move = (dy: number) => {
    const { from } = drag.current;
    if (from < 0) return;
    const { rowHeight } = latest.current;
    const { min, max } = bounds();
    const clamped = clamp(dy, (min - from) * rowHeight, (max - from) * rowHeight);
    dragY.setValue(clamped);
    applyTarget(clamp(from + Math.round(clamped / rowHeight), min, max));
  };

  const finish = () => {
    const { from, target } = drag.current;
    if (from < 0) return;
    drag.current = { from: -1, target: -1 };
    const { rowHeight, reducedMotion: reduced } = latest.current;
    const settle = (toValue: number, value: Animated.Value) =>
      Animated.timing(value, {
        toValue,
        duration: motionDuration(reduced, Durations.rowSettle),
        easing: Easings.standard,
        useNativeDriver: true,
      });
    Animated.parallel([settle((target - from) * rowHeight, dragY), settle(1, lift)]).start(() => {
      if (target !== from) latest.current.onMove(from, target);
      setDraggingIndex(null);
      latest.current.onDragStateChange?.(false);
      requestAnimationFrame(resetPositions);
    });
  };

  const responderFor = (index: number) => {
    const existing = responders.get(index);
    if (existing) return existing;
    const responder = PanResponder.create({
      onStartShouldSetPanResponder: () => latest.current.enabled,
      onMoveShouldSetPanResponder: () => latest.current.enabled,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => begin(index),
      onPanResponderMove: (_, gesture) => move(gesture.dy),
      onPanResponderRelease: finish,
      onPanResponderTerminate: finish,
    });
    responders.set(index, responder);
    return responder;
  };

  useEffect(() => {
    if (!options.enabled && drag.current.from >= 0) finish();
  });

  const rowStyle = useCallback(
    (index: number): Animated.WithAnimatedValue<ViewStyle> => {
      const lifted = index === draggingIndex;
      const shift = shifts[index] ?? 0;
      return {
        transform: [{ translateY: lifted ? dragY : shift }, { scale: lifted ? lift : 1 }],
        zIndex: lifted ? LIFTED_Z_INDEX : 0,
        ...(lifted ? { elevation: LIFTED_ELEVATION, ...LIFTED_SHADOW } : null),
      };
    },
    [dragY, draggingIndex, lift, shifts],
  );

  const handleProps = (index: number): DragHandleProps => {
    const { min, max } = bounds();
    const cached = handles.get(index);
    if (cached && cached.min === min && cached.max === max) return cached.props;
    const actions: AccessibilityActionInfo[] = [
      ...(index > min ? [{ name: 'moveUp', label: 'Move up' }] : []),
      ...(index < max ? [{ name: 'moveDown', label: 'Move down' }] : []),
    ];
    const props: DragHandleProps = {
      ...responderFor(index).panHandlers,
      accessible: true,
      accessibilityRole: 'button',
      accessibilityLabel: 'Reorder',
      accessibilityHint: 'Drag up or down to move',
      accessibilityActions: actions,
      onAccessibilityAction: (event) => {
        const step = event.nativeEvent.actionName === 'moveUp' ? -1 : event.nativeEvent.actionName === 'moveDown' ? 1 : 0;
        if (step !== 0) latest.current.onMove(index, index + step);
      },
    };
    handles.set(index, { min, max, props });
    return props;
  };

  return { rowStyle, handleProps, draggingIndex, scrollEnabled: draggingIndex === null };
}
